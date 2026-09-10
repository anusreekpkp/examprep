import { api } from './api';
import type { TopicStatus } from './syllabus';

export type SessionType = 'NEW_TOPIC' | 'PRACTICE' | 'REVISION' | 'MOCK_TEST' | 'OTHER';
export type Completion = 'YES' | 'PARTIAL' | 'NO';

export interface SessionTopic {
  id: string;
  name: string;
  status: TopicStatus;
  estimatedMinutes: number;
  totalStudyMinutes: number;
  subject: { id: string; name: string; examId: string; exam: { name: string } };
}

export interface StudySession {
  id: string;
  sessionType: SessionType;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  breakSeconds: number;
  plannedMinutes: number | null;
  completion: Completion | null;
  notes: string | null;
  topic: SessionTopic | null;
}

export interface ActiveSession extends StudySession {
  elapsedSeconds: number;
  isStale: boolean;
}

export interface FinishResult {
  session: StudySession;
  minutesRecorded: number;
  elapsedSeconds: number;
  topicStatus: TopicStatus | null;
  seededRevisions: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  NEW_TOPIC: 'New topic',
  PRACTICE: 'Practice',
  REVISION: 'Revision',
  MOCK_TEST: 'Mock test',
  OTHER: 'Other',
};

export async function fetchActiveSession(): Promise<ActiveSession | null> {
  const { data } = await api.get<Envelope<{ active: ActiveSession | null }>>(
    '/api/sessions/active',
  );
  return data.data.active;
}

export async function startSession(payload: {
  topicId?: string | null;
  sessionType: SessionType;
  plannedMinutes: number;
}): Promise<StudySession> {
  const { data } = await api.post<Envelope<{ session: StudySession }>>('/api/sessions', payload);
  return data.data.session;
}

export async function finishSession(
  sessionId: string,
  payload: {
    focusedSeconds?: number;
    breakSeconds?: number;
    completion?: Completion;
    notes?: string;
  },
): Promise<FinishResult> {
  const { data } = await api.post<Envelope<FinishResult>>(
    `/api/sessions/${sessionId}/finish`,
    payload,
  );
  return data.data;
}

export async function discardSession(sessionId: string): Promise<void> {
  await api.delete(`/api/sessions/${sessionId}`);
}

export async function fetchSessions(
  examId?: string,
  limit = 20,
): Promise<{ sessions: StudySession[]; totalMinutes: number; count: number }> {
  const { data } = await api.get<
    Envelope<{ sessions: StudySession[]; totalMinutes: number; count: number }>
  >('/api/sessions', { params: { ...(examId ? { examId } : {}), limit } });
  return data.data;
}

export async function fetchDailyTotals(
  days = 7,
): Promise<{ timeZone: string; days: { date: string; minutes: number }[] }> {
  const { data } = await api.get<
    Envelope<{ timeZone: string; days: { date: string; minutes: number }[] }>
  >('/api/sessions/daily', { params: { days } });
  return data.data;
}

/** "48:05" or "1:02:30" - a clock, not a duration phrase. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
