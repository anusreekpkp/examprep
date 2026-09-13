import { api } from './api';
import type { RankedTopic } from './priorities';
import type { TopicStatus } from './syllabus';

export interface DashboardDay {
  date: string;
  weekday: string;
  minutes: number;
  isToday: boolean;
}

export interface Dashboard {
  name: string;
  timeZone: string;
  today: string;
  exam: {
    id: string;
    name: string;
    examDate: string;
    daysRemaining: number;
    dailyAvailableMinutes: number;
    subjectCount: number;
    topicCount: number;
    completionPercent: number;
    subjects: {
      id: string;
      name: string;
      /** Null when the exam publishes no weightage - never invented. */
      weightage: number | null;
      topicCount: number;
      completionPercent: number;
    }[];
  } | null;
  todayStats: {
    studiedMinutes: number;
    versusYesterdayMinutes: number;
    targetMinutes: number;
    plannedTasks: number;
    plannedRemainingMinutes: number;
    hasPlan: boolean;
    revisionsDue: number;
  };
  weekStats: {
    minutes: number;
    targetMinutes: number;
    percent: number;
    topicsCompleted: number;
    revisionsDone: number;
    sessions: number;
  };
  pace: {
    minutesNeededPerDay: number | null;
    dailyAvailableMinutes: number;
    onTrack: boolean | null;
    weakestSubject: string | null;
    estimatedMinutesRemaining: number;
    weightedReadiness: number;
    neverRevised: number;
    weakTopics: number;
  } | null;
  streak: { current: number; week: DashboardDay[] };
  continueWith: {
    topicId: string;
    topicName: string;
    subjectName: string;
    examId: string;
    status: TopicStatus;
    lastStudiedAt: string;
  } | null;
  priorities: RankedTopic[];
}

export async function fetchDashboard(): Promise<Dashboard> {
  const { data } = await api.get<{ success: boolean; data: Dashboard }>('/api/dashboard');
  return data.data;
}

/** "2 hours ago", "yesterday" - short enough to sit inside a card. */
export function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
