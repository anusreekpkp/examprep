import { api } from './api';
import type { Difficulty, TopicStatus } from './syllabus';

export type ComponentKey =
  | 'examWeight'
  | 'coverageGap'
  | 'weakness'
  | 'revisionDebt'
  | 'deadlinePressure'
  | 'flags';

export interface RankedTopic {
  score: number;
  components: Record<ComponentKey, number>;
  recencyPenalty: number;
  reasons: string[];
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

export interface PriorityResponse {
  today: string;
  timeZone: string;
  count: number;
  topics: RankedTopic[];
  weights: {
    components: Record<ComponentKey, number>;
    recencyPenaltyMax: number;
  };
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

/** Order and labels used for the breakdown bar and legend. */
export const COMPONENT_ORDER: ComponentKey[] = [
  'revisionDebt',
  'coverageGap',
  'weakness',
  'examWeight',
  'deadlinePressure',
  'flags',
];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  revisionDebt: 'Revision overdue',
  coverageGap: 'Still to cover',
  weakness: 'Difficulty',
  examWeight: 'Subject weight',
  deadlinePressure: 'Exam proximity',
  flags: 'Your flags',
};

export const COMPONENT_COLORS: Record<ComponentKey, string> = {
  revisionDebt: 'bg-orange-500',
  coverageGap: 'bg-brand-500',
  weakness: 'bg-red-500',
  examWeight: 'bg-sky-500',
  deadlinePressure: 'bg-amber-500',
  flags: 'bg-emerald-500',
};

/**
 * Turns the score into a word. The number is honest but not actionable - a
 * student cannot do anything with "35.7" - so the band leads and the figure
 * stays as a secondary detail for anyone who wants to check the maths.
 */
export function priorityBand(score: number): { label: string; className: string } {
  // Thresholds sit where real scores fall, not at a tidy 33/66. No single topic
  // can max every component - an overdue, difficult, heavily-weighted topic
  // lands in the mid-60s - so a 55 cut-off would call almost everything medium.
  if (score >= 45) {
    return {
      label: 'High priority',
      className: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    };
  }
  if (score >= 25) {
    return {
      label: 'Medium priority',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    };
  }
  return {
    label: 'Low priority',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
}

/** Deep link that lands the student in a session on this topic. */
export function studyHref(topic: RankedTopic['topic']): string {
  const type = topic.daysOverdue !== null ? '&type=REVISION' : '';
  return `/timer?topicId=${topic.id}&examId=${topic.examId}${type}`;
}

export async function fetchPriorities(examId?: string, limit = 20): Promise<PriorityResponse> {
  const { data } = await api.get<Envelope<PriorityResponse>>('/api/priorities', {
    params: { ...(examId ? { examId } : {}), limit },
  });
  return data.data;
}
