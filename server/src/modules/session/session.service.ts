import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertTopicOwned } from '../../utils/ownership.js';
import { localDateKey, safeTimeZone } from '../../utils/dates.js';
import { seedLadder } from '../revision/revision.service.js';
import type { CompletionStatus, TopicStatus } from '../../generated/prisma/enums.js';

export const startSessionSchema = z.object({
  topicId: z.string().min(1).nullable().optional(),
  sessionType: z.enum(['NEW_TOPIC', 'PRACTICE', 'REVISION', 'MOCK_TEST', 'OTHER']).default('NEW_TOPIC'),
  plannedMinutes: z.number().int().min(1).max(240).default(50),
});

export const finishSessionSchema = z.object({
  /**
   * Seconds the client actually counted as focused, excluding pauses. Clamped
   * server-side to real elapsed time, so it can only ever reduce the figure.
   */
  focusedSeconds: z.number().int().min(0).max(86_400).optional(),
  breakSeconds: z.number().int().min(0).max(86_400).default(0),
  completion: z.enum(['YES', 'PARTIAL', 'NO']).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;

/**
 * A session left running overnight would otherwise record ten hours of "study".
 * Anything past this is treated as forgotten rather than heroic.
 */
const MAX_SESSION_SECONDS = 6 * 60 * 60;

const sessionSelect = {
  id: true,
  sessionType: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  breakSeconds: true,
  plannedMinutes: true,
  completion: true,
  notes: true,
  topic: {
    select: {
      id: true,
      name: true,
      status: true,
      estimatedMinutes: true,
      totalStudyMinutes: true,
      subject: { select: { id: true, name: true, examId: true, exam: { select: { name: true } } } },
    },
  },
} as const;

export async function getActiveSession(userId: string) {
  const session = await prisma.studySession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: sessionSelect,
  });
  if (!session) return { active: null };

  const elapsedSeconds = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
  return {
    active: {
      ...session,
      elapsedSeconds,
      /** True once the wall clock has passed the cap; the client offers to finish. */
      isStale: elapsedSeconds > MAX_SESSION_SECONDS,
    },
  };
}

/**
 * Starting is a server-side record rather than a client timer, so closing the
 * tab or reloading mid-session does not lose the work: the session is recovered
 * from `startedAt` on the next load.
 */
export async function startSession(userId: string, input: StartSessionInput) {
  const existing = await prisma.studySession.findFirst({
    where: { userId, endedAt: null },
    select: { id: true, startedAt: true },
  });
  if (existing) {
    throw ApiError.conflict('A study session is already running. Finish it before starting another.');
  }

  if (input.topicId) await assertTopicOwned(input.topicId, userId);

  return prisma.studySession.create({
    data: {
      userId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType,
      plannedMinutes: input.plannedMinutes,
      startedAt: new Date(),
    },
    select: sessionSelect,
  });
}

/** Which status a completion answer implies, or null to leave it alone. */
function statusFor(completion: CompletionStatus | undefined, current: TopicStatus): TopicStatus | null {
  if (completion === 'YES') return 'COMPLETED_REVISION_DUE';
  if (completion === 'PARTIAL' || completion === 'NO') {
    // Never demote a topic that is already finished; a top-up session on a
    // revised topic should not drag it back to Learning.
    return current === 'NOT_STARTED' ? 'LEARNING' : null;
  }
  return null;
}

/**
 * Ends the session and folds the measured time back into the syllabus. This is
 * the link that makes the timer worth having: minutes land on the topic, and
 * answering "did you finish it?" with Yes seeds the revision ladder.
 */
export async function finishSession(
  userId: string,
  sessionId: string,
  input: FinishSessionInput,
) {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, startedAt: true, endedAt: true, topicId: true },
  });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.endedAt) throw ApiError.conflict('This session has already been finished');

  const now = new Date();
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
  );

  // The client may report *less* than elapsed (it paused, or the student idled),
  // but never more - otherwise the figure would be trivially inflatable.
  const reported = input.focusedSeconds ?? elapsedSeconds;
  const durationSeconds = Math.min(reported, elapsedSeconds, MAX_SESSION_SECONDS);
  const minutes = Math.round(durationSeconds / 60);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const todayKey = localDateKey(now, safeTimeZone(user?.timezone));

  return prisma.$transaction(async (tx) => {
    const finished = await tx.studySession.update({
      where: { id: session.id },
      data: {
        endedAt: now,
        durationSeconds,
        breakSeconds: Math.min(input.breakSeconds, elapsedSeconds),
        ...(input.completion ? { completion: input.completion } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
      select: sessionSelect,
    });

    let seededRevisions = 0;
    let newStatus: TopicStatus | null = null;

    if (session.topicId) {
      const topic = await tx.topic.findUnique({
        where: { id: session.topicId },
        select: {
          status: true,
          _count: { select: { revisions: { where: { status: 'PENDING' } } } },
        },
      });

      if (topic) {
        newStatus = statusFor(input.completion, topic.status);

        await tx.topic.update({
          where: { id: session.topicId },
          data: {
            totalStudyMinutes: { increment: minutes },
            lastStudiedAt: now,
            ...(newStatus ? { status: newStatus } : {}),
            ...(newStatus === 'COMPLETED_REVISION_DUE' ? { completedAt: now } : {}),
          },
        });

        // Finishing a topic here should behave exactly as marking it complete
        // in the syllabus does, ladder included.
        if (newStatus === 'COMPLETED_REVISION_DUE' && topic._count.revisions === 0) {
          seededRevisions = await seedLadder(tx, session.topicId, todayKey);
        }
      }
    }

    return {
      session: finished,
      minutesRecorded: minutes,
      elapsedSeconds,
      topicStatus: newStatus,
      seededRevisions,
    };
  });
}

/** Discards a session started by mistake, recording nothing. */
export async function cancelSession(userId: string, sessionId: string) {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, endedAt: true },
  });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.endedAt) throw ApiError.conflict('A finished session cannot be discarded');

  await prisma.studySession.delete({ where: { id: session.id } });
}

export async function listSessions(userId: string, examId?: string, limit = 30) {
  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      endedAt: { not: null },
      ...(examId ? { topic: { subject: { examId } } } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: sessionSelect,
  });

  const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  return {
    sessions,
    totalMinutes: Math.round(totalSeconds / 60),
    count: sessions.length,
  };
}

/** Minutes studied per day for the last `days` days, in the student's timezone. */
export async function dailyTotals(userId: string, days = 7) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);

  const since = new Date(Date.now() - days * 86_400_000);
  const sessions = await prisma.studySession.findMany({
    where: { userId, endedAt: { not: null }, startedAt: { gte: since } },
    select: { startedAt: true, durationSeconds: true },
  });

  const byDay = new Map<string, number>();
  for (const session of sessions) {
    const key = localDateKey(session.startedAt, timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + session.durationSeconds);
  }

  return {
    timeZone,
    days: [...byDay.entries()]
      .map(([date, seconds]) => ({ date, minutes: Math.round(seconds / 60) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
