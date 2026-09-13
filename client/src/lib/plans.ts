import { api } from './api';
import type { TopicStatus } from './syllabus';

export type PlanActivity = 'NEW_TOPIC' | 'PRACTICE' | 'REVISION' | 'MOCK_TEST' | 'BREAK';
export type PlanItemStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';

export interface PlanItem {
  id: string;
  activity: PlanActivity;
  orderIndex: number;
  startMinuteOfDay: number;
  durationMinutes: number;
  status: PlanItemStatus;
  priorityScore: number | null;
  /** Why the engine put this slot here, frozen when the plan was generated. */
  reason: string | null;
  topic: {
    id: string;
    name: string;
    status: TopicStatus;
    estimatedMinutes: number;
    subject: { id: string; name: string };
  } | null;
}

export interface StudyPlan {
  id: string;
  planDate: string;
  totalMinutes: number;
  isAiGenerated: boolean;
  generatedAt: string;
  items: PlanItem[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const ACTIVITY_LABELS: Record<PlanActivity, string> = {
  NEW_TOPIC: 'New topic',
  PRACTICE: 'Practice',
  REVISION: 'Revision',
  MOCK_TEST: 'Mock test',
  BREAK: 'Break',
};

export const ACTIVITY_CLASSES: Record<PlanActivity, string> = {
  NEW_TOPIC: 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100',
  PRACTICE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  REVISION: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  MOCK_TEST: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  BREAK: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

/**
 * Deep link from a plan item into a timer session already set up for it - the
 * topic, the activity and the slot's length. planItemId travels too so the
 * timer can tick the item off when the session is finished, instead of leaving
 * the student to come back and do it by hand.
 */
export function planItemStudyHref(examId: string, item: PlanItem): string {
  const params = new URLSearchParams({
    examId,
    type: item.activity,
    minutes: String(item.durationMinutes),
    planItemId: item.id,
  });
  if (item.topic) params.set('topicId', item.topic.id);
  return `/timer?${params.toString()}`;
}

/** 480 -> "08:00" */
export function minuteToClock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface PlanResponse {
  plan: StudyPlan | null;
  date: string;
  timeZone: string;
  /** False when the exam publishes no subject weightage the student supplied. */
  hasWeightageData: boolean;
}

export async function fetchPlan(examId: string, date?: string): Promise<PlanResponse> {
  const { data } = await api.get<Envelope<PlanResponse>>(`/api/exams/${examId}/plan`, {
    params: date ? { date } : undefined,
  });
  return data.data;
}

/**
 * Minutes per activity, for the summary a student reads before committing to
 * the day. Breaks are counted separately because they are not study time.
 */
export function planBreakdown(plan: StudyPlan) {
  const totals = new Map<PlanActivity, number>();
  for (const item of plan.items) {
    totals.set(item.activity, (totals.get(item.activity) ?? 0) + item.durationMinutes);
  }
  const studyMinutes = plan.items
    .filter((item) => item.activity !== 'BREAK')
    .reduce((sum, item) => sum + item.durationMinutes, 0);

  return {
    totals: [...totals.entries()].sort((a, b) => b[1] - a[1]),
    studyMinutes,
    breakMinutes: totals.get('BREAK') ?? 0,
    totalMinutes: studyMinutes + (totals.get('BREAK') ?? 0),
  };
}

export async function generatePlan(
  examId: string,
  payload: { availableMinutes?: number; startMinuteOfDay?: number; planDate?: string },
): Promise<StudyPlan> {
  const { data } = await api.post<Envelope<{ plan: StudyPlan }>>(
    `/api/exams/${examId}/plan`,
    payload,
  );
  return data.data.plan;
}

export async function updatePlanItem(itemId: string, status: PlanItemStatus): Promise<void> {
  await api.patch(`/api/plan-items/${itemId}`, { status });
}
