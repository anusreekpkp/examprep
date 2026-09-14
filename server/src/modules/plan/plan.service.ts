import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertExamOwned } from '../../utils/ownership.js';
import { dateKeyToUtcMidnight, localDateKey, safeTimeZone } from '../../utils/dates.js';
import { rankTopics } from '../priority/priority.service.js';
import { listDue } from '../revision/revision.service.js';
import type { PlanItemActivity, PlanItemStatus } from '../../generated/prisma/enums.js';

export const generatePlanSchema = z.object({
  /** "YYYY-MM-DD"; defaults to the student's today. */
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  availableMinutes: z.number().int().min(15).max(960).optional(),
  /** Minutes past midnight the day starts, default 08:00. */
  startMinuteOfDay: z.number().int().min(0).max(1439).default(480),
});

export const updatePlanItemSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED']),
});

export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
export type UpdatePlanItemInput = z.infer<typeof updatePlanItemSchema>;

/** Work for this long, then take a break. */
const FOCUS_BLOCK_MINUTES = 50;
const BREAK_MINUTES = 10;
/** A revision is a refresher, not a re-study, so it gets a short slot. */
const REVISION_MIN = 10;
const REVISION_MAX = 30;
/** No single new topic should eat the whole day. */
const NEW_TOPIC_MAX = 60;

interface PlannedItem {
  topicId: string | null;
  activity: PlanItemActivity;
  durationMinutes: number;
  priorityScore: number | null;
  label: string;
}

const planSelect = {
  id: true,
  planDate: true,
  totalMinutes: true,
  isAiGenerated: true,
  generatedAt: true,
  items: {
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      activity: true,
      orderIndex: true,
      startMinuteOfDay: true,
      durationMinutes: true,
      status: true,
      priorityScore: true,
      topic: {
        select: {
          id: true,
          name: true,
          status: true,
          estimatedMinutes: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

/**
 * Builds a day's schedule from the same signals the rest of the app uses:
 * revisions that have fallen due, then the highest-priority topics.
 *
 * Revisions come first regardless of score. The ladder has already decided
 * today is the day, and letting a high-scoring new topic push a due revision
 * into tomorrow would quietly undo the spacing that makes revision work.
 */
function buildSchedule(
  dueRevisions: { topicId: string; topicName: string; estimatedMinutes: number }[],
  priorities: { topicId: string; name: string; estimatedMinutes: number; score: number; status: string }[],
  availableMinutes: number,
): PlannedItem[] {
  const items: PlannedItem[] = [];
  let used = 0;
  let sinceBreak = 0;

  const remaining = () => availableMinutes - used;

  const addBreakIfNeeded = () => {
    if (sinceBreak < FOCUS_BLOCK_MINUTES) return;
    if (remaining() <= BREAK_MINUTES) return;
    items.push({
      topicId: null,
      activity: 'BREAK',
      durationMinutes: BREAK_MINUTES,
      priorityScore: null,
      label: 'Break',
    });
    used += BREAK_MINUTES;
    sinceBreak = 0;
  };

  for (const revision of dueRevisions) {
    if (remaining() < REVISION_MIN) break;
    addBreakIfNeeded();
    const duration = Math.min(
      remaining(),
      Math.max(REVISION_MIN, Math.min(REVISION_MAX, Math.round(revision.estimatedMinutes * 0.4))),
    );
    items.push({
      topicId: revision.topicId,
      activity: 'REVISION',
      durationMinutes: duration,
      priorityScore: null,
      label: revision.topicName,
    });
    used += duration;
    sinceBreak += duration;
  }

  const scheduled = new Set(items.map((item) => item.topicId));

  for (const topic of priorities) {
    // 15 minutes is the smallest slot worth putting a new topic in.
    if (remaining() < 15) break;
    if (scheduled.has(topic.topicId)) continue;
    addBreakIfNeeded();
    const duration = Math.min(remaining(), Math.min(NEW_TOPIC_MAX, topic.estimatedMinutes));
    items.push({
      topicId: topic.topicId,
      activity: topic.status === 'NOT_STARTED' ? 'NEW_TOPIC' : 'PRACTICE',
      durationMinutes: duration,
      priorityScore: topic.score,
      label: topic.name,
    });
    scheduled.add(topic.topicId);
    used += duration;
    sinceBreak += duration;
  }

  return items;
}

export async function generatePlan(userId: string, examId: string, input: GeneratePlanInput) {
  await assertExamOwned(examId, userId);

  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    select: { dailyAvailableMinutes: true, user: { select: { timezone: true } } },
  });
  if (!exam) throw ApiError.notFound('Exam not found');

  const timeZone = safeTimeZone(exam.user.timezone);
  const planDateKey = input.planDate ?? localDateKey(new Date(), timeZone);
  const availableMinutes = input.availableMinutes ?? exam.dailyAvailableMinutes;

  const [due, ranked] = await Promise.all([
    listDue(userId, examId),
    rankTopics(userId, { examId, limit: 40 }),
  ]);

  const schedule = buildSchedule(
    due.revisions.map((revision) => ({
      topicId: revision.topic.id,
      topicName: revision.topic.name,
      estimatedMinutes: revision.topic.estimatedMinutes,
    })),
    ranked.topics.map((entry) => ({
      topicId: entry.topic.id,
      name: entry.topic.name,
      estimatedMinutes: entry.topic.estimatedMinutes,
      score: entry.score,
      status: entry.topic.status,
    })),
    availableMinutes,
  );

  if (schedule.length === 0) {
    throw ApiError.badRequest(
      'There is nothing to schedule yet - add some topics to this exam first.',
    );
  }

  const planDate = dateKeyToUtcMidnight(planDateKey);
  let cursor = input.startMinuteOfDay;

  // Regenerating replaces the day rather than stacking a second plan on it.
  const plan = await prisma.$transaction(async (tx) => {
    await tx.studyPlan.deleteMany({ where: { userId, examId, planDate } });

    return tx.studyPlan.create({
      data: {
        userId,
        examId,
        planDate,
        totalMinutes: schedule.reduce((sum, item) => sum + item.durationMinutes, 0),
        items: {
          create: schedule.map((item, index) => {
            const startMinuteOfDay = cursor;
            cursor += item.durationMinutes;
            return {
              topicId: item.topicId,
              activity: item.activity,
              orderIndex: index,
              startMinuteOfDay,
              durationMinutes: item.durationMinutes,
              priorityScore: item.priorityScore,
            };
          }),
        },
      },
      select: planSelect,
    });
  });

  return { plan, timeZone };
}

export async function getPlan(userId: string, examId: string, dateKey?: string) {
  await assertExamOwned(examId, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);
  const key = dateKey ?? localDateKey(new Date(), timeZone);

  const plan = await prisma.studyPlan.findFirst({
    where: { userId, examId, planDate: dateKeyToUtcMidnight(key) },
    select: planSelect,
  });

  return { plan, date: key, timeZone };
}

export async function updatePlanItem(
  userId: string,
  itemId: string,
  input: UpdatePlanItemInput,
) {
  const item = await prisma.studyPlanItem.findFirst({
    where: { id: itemId, studyPlan: { userId } },
    select: { id: true },
  });
  if (!item) throw ApiError.notFound('Plan item not found');

  return prisma.studyPlanItem.update({
    where: { id: item.id },
    data: { status: input.status as PlanItemStatus },
    select: {
      id: true,
      status: true,
      activity: true,
      durationMinutes: true,
      topic: { select: { id: true, name: true } },
    },
  });
}

export async function deletePlan(userId: string, planId: string) {
  const plan = await prisma.studyPlan.findFirst({
    where: { id: planId, userId },
    select: { id: true },
  });
  if (!plan) throw ApiError.notFound('Plan not found');
  await prisma.studyPlan.delete({ where: { id: plan.id } });
}
