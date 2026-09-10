import { api } from './api';
import type { Difficulty } from './syllabus';

export interface DueRevision {
  id: string;
  stage: number;
  scheduledFor: string;
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

export interface DueResponse {
  today: string;
  timeZone: string;
  dueCount: number;
  overdueCount: number;
  estimatedMinutes: number;
  revisions: DueRevision[];
}

export interface UpcomingDay {
  date: string;
  inDays: number;
  count: number;
  estimatedMinutes: number;
  revisions: DueRevision[];
}

export interface CompleteResponse {
  topic: { id: string; name: string; status: string; revisionCount: number };
  nextRevisionInDays: number | null;
  graduated: boolean;
  message: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

/** Matches BASE_INTERVAL_DAYS on the server. */
export const TOTAL_STAGES = 5;

export async function fetchDueRevisions(examId?: string): Promise<DueResponse> {
  const { data } = await api.get<Envelope<DueResponse>>('/api/revisions/due', {
    params: examId ? { examId } : undefined,
  });
  return data.data;
}

export async function fetchUpcoming(
  examId: string,
  days = 14,
): Promise<{ today: string; days: UpcomingDay[] }> {
  const { data } = await api.get<Envelope<{ today: string; days: UpcomingDay[] }>>(
    `/api/exams/${examId}/revisions/upcoming`,
    { params: { days } },
  );
  return data.data;
}

export async function completeRevision(
  revisionId: string,
  feedback: Difficulty,
): Promise<CompleteResponse> {
  const { data } = await api.post<Envelope<CompleteResponse>>(
    `/api/revisions/${revisionId}/complete`,
    { feedback },
  );
  return data.data;
}

export async function skipRevision(revisionId: string): Promise<{ rescheduledFor: string }> {
  const { data } = await api.post<Envelope<{ rescheduledFor: string }>>(
    `/api/revisions/${revisionId}/skip`,
  );
  return data.data;
}

export function describeDue(dueInDays: number): string {
  if (dueInDays === 0) return 'due today';
  if (dueInDays === -1) return '1 day overdue';
  if (dueInDays < 0) return `${Math.abs(dueInDays)} days overdue`;
  if (dueInDays === 1) return 'due tomorrow';
  return `due in ${dueInDays} days`;
}
