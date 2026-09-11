import { api } from './api';

export interface DayTotal {
  date: string;
  weekday: string;
  minutes: number;
}

export interface SubjectTime {
  subjectId: string;
  subjectName: string;
  minutes: number;
  accuracy: number | null;
  topicsCompleted: number;
  topicsTotal: number;
}

export interface Insight {
  tone: 'warning' | 'positive' | 'neutral';
  message: string;
}

export interface StudySummary {
  timeZone: string;
  from: string;
  to: string;
  days: number;
  totalMinutes: number;
  sessionCount: number;
  topicsCompleted: number;
  studiedDays: number;
  averageDailyMinutes: number;
  mostProductiveDay: DayTotal | null;
  currentStreak: number;
  byDay: DayTotal[];
  bySubject: SubjectTime[];
  insights: Insight[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const INSIGHT_CLASSES: Record<Insight['tone'], string> = {
  warning: 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  positive: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  neutral: 'bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
};

export async function fetchSummary(days = 7, examId?: string): Promise<StudySummary> {
  const { data } = await api.get<Envelope<StudySummary>>('/api/analytics/summary', {
    params: { days, ...(examId ? { examId } : {}) },
  });
  return data.data;
}
