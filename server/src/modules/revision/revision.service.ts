import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertExamOwned } from '../../utils/ownership.js';
import {
  addDaysToKey,
  dateKeyToUtcMidnight,
  daysBetweenKeys,
  localDateKey,
  safeTimeZone,
} from '../../utils/dates.js';
import {
  FINAL_STAGE,
  explainFeedback,
  planInitialLadder,
  planRemainingLadder,
  shouldRepeatFinalStage,
} from './revisionSchedule.js';
import type { Difficulty } from '../../generated/prisma/enums.js';

export const completeRevisionSchema = z.object({
  feedback: z.enum(['EASY', 'MODERATE', 'DIFFICULT']),
});

export type CompleteRevisionInput = z.infer<typeof completeRevisionSchema>;

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function userTimeZone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return safeTimeZone(user?.timezone);
}

// ------------------------------------------------------------------ seed --

/**
 * Replaces a topic's pending ladder with a fresh one. Called when a topic is
 * marked complete, including a re-completion after being reset, so any stale
 * pending rows are cleared first rather than accumulating duplicates.
 * Revisions already done are left alone - they are history.
 */
export async function seedLadder(
  tx: TxClient,
  topicId: string,
  todayKey: string,
): Promise<number> {
  await tx.revision.deleteMany({ where: { topicId, status: 'PENDING' } });

  const planned = planInitialLadder(todayKey);
  await tx.revision.createMany({
    data: planned.map((entry) => ({
      topicId,
      stage: entry.stage,
      scheduledFor: dateKeyToUtcMidnight(entry.scheduledForKey),
    })),
  });

  return planned.length;
}

/** Clears a topic's schedule when it goes back to Not started / Learning. */
export async function clearLadder(tx: TxClient, topicId: string): Promise<void> {
  await tx.revision.deleteMany({ where: { topicId, status: 'PENDING' } });
}

// ------------------------------------------------------------------ read --

const revisionSelect = {
  id: true,
  stage: true,
  scheduledFor: true,
  status: true,
  topic: {
    select: {
      id: true,
      name: true,
      difficulty: true,
      estimatedMinutes: true,
      revisionCount: true,
      subject: { select: { id: true, name: true, examId: true, exam: { select: { name: true } } } },
    },
  },
} as const;

interface DueRevision {
  id: string;
  stage: number;
  scheduledFor: Date;
  /** Negative means overdue by that many days. */
  dueInDays: number;
  isOverdue: boolean;
  topic: {
    id: string;
    name: string;
    difficulty: Difficulty;
    estimatedMinutes: number;
    revisionCount: number;
    subjectName: string;
    examId: string;
    examName: string;
  };
}

function shape(
  revision: {
    id: string;
    stage: number;
    scheduledFor: Date;
    topic: {
      id: string;
      name: string;
      difficulty: Difficulty;
      estimatedMinutes: number;
      revisionCount: number;
      subject: { name: string; examId: string; exam: { name: string } };
    };
  },
  todayKey: string,
): DueRevision {
  const scheduledKey = revision.scheduledFor.toISOString().slice(0, 10);
  const dueInDays = daysBetweenKeys(todayKey, scheduledKey);
  return {
    id: revision.id,
    stage: revision.stage,
    scheduledFor: revision.scheduledFor,
    dueInDays,
    isOverdue: dueInDays < 0,
    topic: {
      id: revision.topic.id,
      name: revision.topic.name,
      difficulty: revision.topic.difficulty,
      estimatedMinutes: revision.topic.estimatedMinutes,
      revisionCount: revision.topic.revisionCount,
      subjectName: revision.topic.subject.name,
      examId: revision.topic.subject.examId,
      examName: revision.topic.subject.exam.name,
    },
  };
}

/**
 * Everything due today or earlier. Overdue revisions are included rather than
 * expiring: a missed revision is exactly the thing the student most needs back.
 */
export async function listDue(userId: string, examId?: string) {
  const timeZone = await userTimeZone(userId);
  const todayKey = localDateKey(new Date(), timeZone);

  const rows = await prisma.revision.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: dateKeyToUtcMidnight(todayKey) },
      topic: {
        subject: {
          exam: { userId, ...(examId ? { id: examId } : {}) },
        },
      },
    },
    orderBy: [{ scheduledFor: 'asc' }, { stage: 'asc' }],
    select: revisionSelect,
  });

  const due = rows.map((row) => shape(row, todayKey));

  return {
    today: todayKey,
    timeZone,
    dueCount: due.length,
    overdueCount: due.filter((entry) => entry.isOverdue).length,
    estimatedMinutes: due.reduce((total, entry) => total + entry.topic.estimatedMinutes, 0),
    revisions: due,
  };
}

/** The next `days` days, so the student can see the load coming. */
export async function listUpcoming(userId: string, examId: string, days = 14) {
  await assertExamOwned(examId, userId);
  const timeZone = await userTimeZone(userId);
  const todayKey = localDateKey(new Date(), timeZone);
  const horizonKey = addDaysToKey(todayKey, days);

  const rows = await prisma.revision.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: {
        gt: dateKeyToUtcMidnight(todayKey),
        lte: dateKeyToUtcMidnight(horizonKey),
      },
      topic: { subject: { examId } },
    },
    orderBy: [{ scheduledFor: 'asc' }],
    select: revisionSelect,
  });

  // Grouped by day so the client can render a simple workload strip.
  const byDay = new Map<string, DueRevision[]>();
  for (const row of rows) {
    const shaped = shape(row, todayKey);
    const key = row.scheduledFor.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(shaped);
    else byDay.set(key, [shaped]);
  }

  return {
    today: todayKey,
    days: [...byDay.entries()].map(([date, revisions]) => ({
      date,
      inDays: daysBetweenKeys(todayKey, date),
      count: revisions.length,
      estimatedMinutes: revisions.reduce((t, r) => t + r.topic.estimatedMinutes, 0),
      revisions,
    })),
  };
}

// ----------------------------------------------------------------- write --

async function assertRevisionOwned(revisionId: string, userId: string) {
  const revision = await prisma.revision.findFirst({
    where: { id: revisionId, topic: { subject: { exam: { userId } } } },
    select: { id: true, topicId: true, stage: true, status: true },
  });
  if (!revision) throw ApiError.notFound('Revision not found');
  return revision;
}

/**
 * Records a completed revision and reschedules everything still ahead of it
 * according to how hard the student found it.
 */
export async function completeRevision(
  userId: string,
  revisionId: string,
  input: CompleteRevisionInput,
) {
  const revision = await assertRevisionOwned(revisionId, userId);
  if (revision.status !== 'PENDING') {
    throw ApiError.conflict('This revision has already been recorded');
  }

  const timeZone = await userTimeZone(userId);
  const todayKey = localDateKey(new Date(), timeZone);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.revision.update({
      where: { id: revision.id },
      data: { status: 'COMPLETED', completedAt: now, feedback: input.feedback },
    });

    // Everything still ahead is rebuilt from today, so a rating applies
    // immediately rather than only from the next revision onward.
    await tx.revision.deleteMany({
      where: { topicId: revision.topicId, status: 'PENDING', stage: { gt: revision.stage } },
    });

    const remaining = planRemainingLadder(revision.stage, input.feedback, todayKey);

    if (shouldRepeatFinalStage(revision.stage, input.feedback)) {
      // A Difficult verdict on the final stage earns one more pass instead of
      // graduating the topic on its weakest note.
      remaining.push({ stage: FINAL_STAGE, scheduledForKey: addDaysToKey(todayKey, 3) });
    }

    if (remaining.length > 0) {
      await tx.revision.createMany({
        data: remaining.map((entry) => ({
          topicId: revision.topicId,
          stage: entry.stage,
          scheduledFor: dateKeyToUtcMidnight(entry.scheduledForKey),
        })),
      });
    }

    const graduated = remaining.length === 0;

    const topic = await tx.topic.update({
      where: { id: revision.topicId },
      data: {
        revisionCount: { increment: 1 },
        lastRevisedAt: now,
        // The ladder is finished only when nothing is left pending.
        status: graduated ? 'WELL_REVISED' : 'COMPLETED_REVISION_DUE',
        // The student just told us how hard it was; believe them.
        difficulty: input.feedback,
      },
      select: { id: true, name: true, status: true, revisionCount: true },
    });

    const nextInDays = remaining[0]
      ? daysBetweenKeys(todayKey, remaining[0].scheduledForKey)
      : null;

    return { topic, nextInDays, graduated };
  });

  return {
    topic: result.topic,
    nextRevisionInDays: result.nextInDays,
    graduated: result.graduated,
    message: explainFeedback(input.feedback, result.nextInDays),
  };
}

/**
 * Skipping pushes the revision to tomorrow rather than deleting it. A skipped
 * revision that vanished would quietly shorten the ladder, which is the
 * opposite of what a student who skipped it needs.
 */
export async function skipRevision(userId: string, revisionId: string) {
  const revision = await assertRevisionOwned(revisionId, userId);
  if (revision.status !== 'PENDING') {
    throw ApiError.conflict('This revision has already been recorded');
  }

  const timeZone = await userTimeZone(userId);
  const tomorrowKey = addDaysToKey(localDateKey(new Date(), timeZone), 1);

  await prisma.revision.update({
    where: { id: revision.id },
    data: { scheduledFor: dateKeyToUtcMidnight(tomorrowKey) },
  });

  return { rescheduledFor: tomorrowKey };
}
