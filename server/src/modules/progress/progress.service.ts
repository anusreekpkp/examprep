import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertTopicOwned } from '../../utils/ownership.js';
import { daysUntil } from '../syllabus/syllabus.service.js';
import type { UpdateTopicStatusInput } from '../syllabus/syllabus.schema.js';
import { STATUS_WEIGHT } from './statusWeight.js';
import { clearLadder, seedLadder } from '../revision/revision.service.js';
import { localDateKey, safeTimeZone } from '../../utils/dates.js';
import type { Difficulty, TopicStatus } from '../../generated/prisma/enums.js';

// ----------------------------------------------------------- transitions --

/**
 * Applies a status change together with the timestamps it implies. Phase 4 hooks
 * revision scheduling in here, which is why this is not a plain field update.
 */
export async function updateTopicStatus(
  userId: string,
  topicId: string,
  input: UpdateTopicStatusInput,
) {
  await assertTopicOwned(topicId, userId);

  const current = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      status: true,
      completedAt: true,
      _count: { select: { revisions: { where: { status: 'PENDING' } } } },
      subject: { select: { exam: { select: { user: { select: { timezone: true } } } } } },
    },
  });
  if (!current) throw ApiError.notFound('Topic not found');

  const now = new Date();
  const data: {
    status: TopicStatus;
    difficulty?: Difficulty;
    completedAt?: Date | null;
    lastStudiedAt?: Date;
    lastRevisedAt?: Date;
  } = { status: input.status };

  if (input.difficulty) data.difficulty = input.difficulty;

  switch (input.status) {
    case 'NOT_STARTED':
      // A full reset: the topic is being put back on the pile.
      data.completedAt = null;
      break;
    case 'LEARNING':
      data.lastStudiedAt = now;
      data.completedAt = null;
      break;
    case 'COMPLETED_REVISION_DUE':
      data.lastStudiedAt = now;
      // Keep the original completion date if it was already completed once,
      // so re-marking after a revision does not reset the history.
      data.completedAt = current.completedAt ?? now;
      break;
    case 'WELL_REVISED':
      data.completedAt = current.completedAt ?? now;
      data.lastRevisedAt = now;
      break;
  }

  const timeZone = safeTimeZone(current.subject.exam.user.timezone);
  const todayKey = localDateKey(now, timeZone);
  const hasPendingLadder = current._count.revisions > 0;

  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.update({ where: { id: topicId }, data });

    if (input.status === 'COMPLETED_REVISION_DUE') {
      // Only seed when nothing is pending. Re-marking a topic that is already
      // part-way through its ladder must not wipe the progress made through it.
      if (!hasPendingLadder) await seedLadder(tx, topicId, todayKey);
    } else {
      // Back to Not started / Learning, or manually declared Well revised:
      // either way the outstanding schedule no longer applies.
      await clearLadder(tx, topicId);
    }

    return topic;
  });
}

// -------------------------------------------------------------- rollups --

export interface SubjectProgress {
  id: string;
  name: string;
  /** Null when the exam publishes no weightage - see Subject.weightage. */
  weightage: number | null;
  totalTopics: number;
  notStarted: number;
  learning: number;
  revisionDue: number;
  wellRevised: number;
  completionPercent: number;
  weakTopics: number;
  estimatedMinutesRemaining: number;
}

interface TopicRow {
  status: TopicStatus;
  difficulty: Difficulty;
  isStarred: boolean;
  estimatedMinutes: number;
  revisionCount: number;
}

function summarise(topics: TopicRow[]) {
  const total = topics.length;
  const covered = topics.reduce((sum, t) => sum + STATUS_WEIGHT[t.status], 0);
  return {
    totalTopics: total,
    notStarted: topics.filter((t) => t.status === 'NOT_STARTED').length,
    learning: topics.filter((t) => t.status === 'LEARNING').length,
    revisionDue: topics.filter((t) => t.status === 'COMPLETED_REVISION_DUE').length,
    wellRevised: topics.filter((t) => t.status === 'WELL_REVISED').length,
    completionPercent: total === 0 ? 0 : Math.round((covered / total) * 100),
    // "Weak" means the student flagged it hard and has not yet finished
    // revising it. Phase 7 will fold in mock-test accuracy.
    weakTopics: topics.filter((t) => t.difficulty === 'DIFFICULT' && t.status !== 'WELL_REVISED')
      .length,
    estimatedMinutesRemaining: topics
      .filter((t) => t.status === 'NOT_STARTED' || t.status === 'LEARNING')
      .reduce((sum, t) => sum + t.estimatedMinutes, 0),
  };
}

export async function getExamProgress(userId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    include: {
      subjects: {
        orderBy: { orderIndex: 'asc' },
        include: {
          topics: {
            select: {
              status: true,
              difficulty: true,
              isStarred: true,
              estimatedMinutes: true,
              revisionCount: true,
            },
          },
        },
      },
    },
  });

  if (!exam) throw ApiError.notFound('Exam not found');

  const subjects: SubjectProgress[] = exam.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    weightage: subject.weightage,
    ...summarise(subject.topics),
  }));

  const allTopics = exam.subjects.flatMap((s) => s.topics);
  const overall = summarise(allTopics);
  const daysRemaining = daysUntil(exam.examDate);

  /**
   * Two different questions, deliberately reported separately:
   *  - completionPercent: how much of the syllabus is covered, topic by topic.
   *  - weightedReadiness: the same, weighted by how much each subject is worth
   *    in the paper. A student can be 70% through the syllabus while weak on the
   *    subject carrying half the marks, and only this number shows it.
   *
   * It is null when no subject carries a supplied weightage: with nothing to
   * weight by, the "weighted" figure would just be the plain percentage wearing
   * a more authoritative label.
   */
  const weighted = subjects.filter(
    (s): s is SubjectProgress & { weightage: number } => s.weightage !== null,
  );
  const weightTotal = weighted.reduce((sum, s) => sum + s.weightage, 0);
  const weightedReadiness =
    weightTotal === 0
      ? null
      : Math.round(
          weighted.reduce((sum, s) => sum + s.completionPercent * s.weightage, 0) / weightTotal,
        );
  const hasWeightageData = weighted.length > 0;

  const minutesNeededPerDay =
    daysRemaining > 0 ? Math.ceil(overall.estimatedMinutesRemaining / daysRemaining) : null;

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      examDate: exam.examDate,
      daysRemaining,
      dailyAvailableMinutes: exam.dailyAvailableMinutes,
    },
    hasWeightageData,
    overall: {
      ...overall,
      weightedReadiness,
      starred: allTopics.filter((t) => t.isStarred).length,
      /** Completed but never actually revised - the silent backlog. */
      neverRevised: allTopics.filter(
        (t) => t.status !== 'NOT_STARTED' && t.status !== 'LEARNING' && t.revisionCount === 0,
      ).length,
    },
    subjects,
    pace: {
      minutesNeededPerDay,
      dailyAvailableMinutes: exam.dailyAvailableMinutes,
      /** Null when the exam has passed or nothing is left to study. */
      onTrack:
        minutesNeededPerDay === null ? null : minutesNeededPerDay <= exam.dailyAvailableMinutes,
      /** Weakest subject by coverage, ignoring ones with no topics yet. */
      weakestSubject:
        subjects
          .filter((s) => s.totalTopics > 0)
          .sort((a, b) => a.completionPercent - b.completionPercent)[0]?.name ?? null,
    },
  };
}
