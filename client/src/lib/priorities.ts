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

export async function fetchPriorities(examId?: string, limit = 20): Promise<PriorityResponse> {
  const { data } = await api.get<Envelope<PriorityResponse>>('/api/priorities', {
    params: { ...(examId ? { examId } : {}), limit },
  });
  return data.data;
}
