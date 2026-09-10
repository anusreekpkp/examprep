import { prisma } from '../../lib/prisma.js';
import { assertExamOwned } from '../../utils/ownership.js';
import { daysBetweenKeys, localDateKey, safeTimeZone } from '../../utils/dates.js';
import { daysUntil } from '../syllabus/syllabus.service.js';
import { scoreTopic, type PriorityBreakdown } from './priorityScore.js';
import type { Difficulty, TopicStatus } from '../../generated/prisma/enums.js';

export interface RankedTopic extends PriorityBreakdown {
  topic: {
    id: string;
    name: string;
    status: TopicStatus;
    difficulty: Difficulty;
    estimatedMinutes: number;
    totalStudyMinutes: number;
    isStarred: boolean;
    isFrequentlyAsked: boolean;
    subjectId: string;
    subjectName: string;
    examId: string;
    examName: string;
    daysOverdue: number | null;
    daysSinceStudied: number | null;
  };
}

/**
 * Ranks topics by what the student should do next.
 *
 * Only leaf topics are ranked. A parent like "Discrete Mathematics" that has
 * sub-topics is a grouping, not a study action - recommending it would leave the
 * student wondering which part to actually open.
 */
export async function rankTopics(
  userId: string,
  options: { examId?: string; limit?: number } = {},
): Promise<{ today: string; timeZone: string; count: number; topics: RankedTopic[] }> {
  if (options.examId) await assertExamOwned(options.examId, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);

  const topics = await prisma.topic.findMany({
    where: {
      subject: {
        exam: {
          userId,
          isActive: true,
          ...(options.examId ? { id: options.examId } : {}),
        },
      },
      // Leaves only: a topic with children is a heading, not a thing to study.
      childTopics: { none: {} },
    },
    select: {
      id: true,
      name: true,
      status: true,
      difficulty: true,
      estimatedMinutes: true,
      totalStudyMinutes: true,
      isStarred: true,
      isFrequentlyAsked: true,
      lastStudiedAt: true,
      subject: {
        select: {
          id: true,
          name: true,
          weightage: true,
          examId: true,
          exam: { select: { name: true, examDate: true } },
        },
      },
      revisions: {
        where: { status: 'PENDING' },
        orderBy: { scheduledFor: 'asc' },
        take: 1,
        select: { scheduledFor: true },
      },
    },
  });

  const ranked = topics.map((topic) => {
    const nextRevision = topic.revisions[0];
    // Positive means overdue by that many days; null when nothing is due yet.
    const daysOverdue = nextRevision
      ? Math.max(
          -1,
          daysBetweenKeys(nextRevision.scheduledFor.toISOString().slice(0, 10), todayKey),
        )
      : null;

    const daysSinceStudied = topic.lastStudiedAt
      ? daysBetweenKeys(localDateKey(topic.lastStudiedAt, timeZone), todayKey)
      : null;

    const breakdown = scoreTopic({
      status: topic.status,
      difficulty: topic.difficulty,
      isStarred: topic.isStarred,
      isFrequentlyAsked: topic.isFrequentlyAsked,
      subjectWeightage: topic.subject.weightage,
      estimatedMinutes: topic.estimatedMinutes,
      totalStudyMinutes: topic.totalStudyMinutes,
      lastStudiedAt: topic.lastStudiedAt,
      daysOverdue: daysOverdue !== null && daysOverdue >= 0 ? daysOverdue : null,
      daysUntilExam: daysUntil(topic.subject.exam.examDate, now),
      daysSinceStudied,
    });

    return {
      ...breakdown,
      topic: {
        id: topic.id,
        name: topic.name,
        status: topic.status,
        difficulty: topic.difficulty,
        estimatedMinutes: topic.estimatedMinutes,
        totalStudyMinutes: topic.totalStudyMinutes,
        isStarred: topic.isStarred,
        isFrequentlyAsked: topic.isFrequentlyAsked,
        subjectId: topic.subject.id,
        subjectName: topic.subject.name,
        examId: topic.subject.examId,
        examName: topic.subject.exam.name,
        daysOverdue: daysOverdue !== null && daysOverdue >= 0 ? daysOverdue : null,
        daysSinceStudied,
      },
    } satisfies RankedTopic;
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, meaningful tie-break: shorter topics first, so a tied pair is
    // ordered by what can actually be finished in a sitting.
    return a.topic.estimatedMinutes - b.topic.estimatedMinutes;
  });

  const limit = options.limit ?? 20;

  return {
    today: todayKey,
    timeZone,
    count: ranked.length,
    topics: ranked.slice(0, limit),
  };
}
