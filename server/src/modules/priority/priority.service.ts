import { prisma } from '../../lib/prisma.js';
import { assertExamOwned } from '../../utils/ownership.js';
import { daysBetweenKeys, localDateKey, safeTimeZone } from '../../utils/dates.js';
import { daysUntil } from '../syllabus/syllabus.service.js';
import { COMPONENT_MAX, scoreTopic, type PriorityBreakdown } from './priorityScore.js';
import { subjectAccuracyMap } from '../mock/mock.service.js';
import type { Difficulty, TopicStatus } from '../../generated/prisma/enums.js';

interface SortKey {
  subjectOrder: number;
  topicOrder: number;
  subjectId: string;
}

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
    subjectAccuracy: number | null;
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
): Promise<{
  today: string;
  timeZone: string;
  count: number;
  /** True only when every subject in scope carries a supplied weightage. */
  hasWeightageData: boolean;
  maxScore: number;
  topics: RankedTopic[];
}> {
  if (options.examId) await assertExamOwned(options.examId, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);

  // Mock results are evidence the student may not have reflected in the
  // difficulty flags, so they feed the weakness component directly.
  const accuracyBySubject = await subjectAccuracyMap(userId);

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
      orderIndex: true,
      subject: {
        select: {
          id: true,
          name: true,
          weightage: true,
          orderIndex: true,
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

  /**
   * All-or-nothing on purpose. A half-filled weightage map is not a weightage
   * map: scoring against it would treat every subject the student has not got
   * round to yet as worth zero marks, which is a stronger claim than the one
   * they made. Either the split is known or the engine says it is not.
   */
  const hasWeightageData =
    topics.length > 0 && topics.every((topic) => topic.subject.weightage !== null);

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
      subjectWeightage: hasWeightageData ? topic.subject.weightage : null,
      estimatedMinutes: topic.estimatedMinutes,
      totalStudyMinutes: topic.totalStudyMinutes,
      lastStudiedAt: topic.lastStudiedAt,
      daysOverdue: daysOverdue !== null && daysOverdue >= 0 ? daysOverdue : null,
      daysUntilExam: daysUntil(topic.subject.exam.examDate, now),
      daysSinceStudied,
      subjectAccuracy: accuracyBySubject.get(topic.subject.id) ?? null,
    });

    return {
      ...breakdown,
      // Kept off the public topic shape: these only exist to make ties break
      // the same way every time.
      sortKey: {
        subjectOrder: topic.subject.orderIndex,
        topicOrder: topic.orderIndex,
        subjectId: topic.subject.id,
      },
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
        subjectAccuracy: accuracyBySubject.get(topic.subject.id) ?? null,
      },
    } satisfies RankedTopic & { sortKey: SortKey };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, meaningful tie-break: shorter topics first, so a tied pair is
    // ordered by what can actually be finished in a sitting.
    if (a.topic.estimatedMinutes !== b.topic.estimatedMinutes) {
      return a.topic.estimatedMinutes - b.topic.estimatedMinutes;
    }
    // Then syllabus order, so the result never depends on row order from the
    // database. Without this the list genuinely is arbitrary among equals.
    if (a.sortKey.subjectOrder !== b.sortKey.subjectOrder) {
      return a.sortKey.subjectOrder - b.sortKey.subjectOrder;
    }
    return a.sortKey.topicOrder - b.sortKey.topicOrder;
  });

  const balanced = spreadAcrossSubjects(ranked);
  const limit = options.limit ?? 20;

  return {
    today: todayKey,
    timeZone,
    count: balanced.length,
    hasWeightageData,
    maxScore: hasWeightageData ? 100 : 100 - COMPONENT_MAX.examWeight,
    topics: balanced.slice(0, limit).map(({ sortKey: _sortKey, ...entry }) => entry),
  };
}

/**
 * Rotates subjects within each run of equally-scored topics.
 *
 * On day one nothing distinguishes one untouched topic from another: no
 * weightage, no performance history, no revisions due. Every topic scores the
 * same, so the order was whatever came back from the database first - which is
 * why a plan could open with three Engineering Mathematics topics in a row and
 * look arbitrary. Rotating subjects turns that tie into deliberate balanced
 * coverage, and leaves any topic that genuinely outranks another untouched.
 */
function spreadAcrossSubjects<T extends { score: number; sortKey: { subjectId: string } }>(
  ordered: T[],
): T[] {
  const out: T[] = [];

  for (let start = 0; start < ordered.length; ) {
    let end = start + 1;
    while (end < ordered.length && ordered[end]?.score === ordered[start]?.score) end += 1;

    const group = ordered.slice(start, end);
    // Buckets keep their existing relative order, so syllabus order survives.
    const bySubject = new Map<string, T[]>();
    for (const entry of group) {
      const bucket = bySubject.get(entry.sortKey.subjectId);
      if (bucket) bucket.push(entry);
      else bySubject.set(entry.sortKey.subjectId, [entry]);
    }

    const queues = [...bySubject.values()];
    while (queues.some((queue) => queue.length > 0)) {
      for (const queue of queues) {
        const next = queue.shift();
        if (next) out.push(next);
      }
    }

    start = end;
  }

  return out;
}
