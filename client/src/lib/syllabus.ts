import { api } from './api';

export type TopicStatus = 'NOT_STARTED' | 'LEARNING' | 'COMPLETED_REVISION_DUE' | 'WELL_REVISED';
export type Difficulty = 'EASY' | 'MODERATE' | 'DIFFICULT';

export interface TopicNode {
  id: string;
  name: string;
  orderIndex: number;
  status: TopicStatus;
  difficulty: Difficulty;
  isStarred: boolean;
  isFrequentlyAsked: boolean;
  estimatedMinutes: number;
  totalStudyMinutes: number;
  revisionCount: number;
  lastStudiedAt: string | null;
  children: TopicNode[];
}

export interface SubjectNode {
  id: string;
  name: string;
  orderIndex: number;
  /** Null when the exam publishes no weightage - never invented. */
  weightage: number | null;
  colorHex: string | null;
  topicCount: number;
  completionPercent: number;
  notStarted: number;
  learning: number;
  revisionDue: number;
  wellRevised: number;
  topics: TopicNode[];
}

export interface ExamSummary {
  id: string;
  name: string;
  examDate: string;
  dailyAvailableMinutes: number;
  isActive: boolean;
  daysRemaining: number;
  subjectCount: number;
  topicCount: number;
  createdAt: string;
}

export interface ExamTree {
  exam: {
    id: string;
    name: string;
    examDate: string;
    dailyAvailableMinutes: number;
    isActive: boolean;
    daysRemaining: number;
  };
  subjects: SubjectNode[];
  stats: {
    completionPercent: number;
    totalTopics: number;
    notStarted: number;
    learning: number;
    revisionDue: number;
    wellRevised: number;
    starred: number;
    estimatedMinutesRemaining: number;
  };
}

export interface SubjectProgress {
  id: string;
  name: string;
  /** Null when the exam publishes no weightage - never invented. */
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

export interface OverallProgress {
  totalTopics: number;
  notStarted: number;
  learning: number;
  revisionDue: number;
  wellRevised: number;
  completionPercent: number;
  weakTopics: number;
  estimatedMinutesRemaining: number;
  /** Coverage weighted by each subject's share of the paper. */
  weightedReadiness: number;
  starred: number;
  /** Completed but never actually revised - the silent backlog. */
  neverRevised: number;
}

export interface ExamProgress {
  exam: {
    id: string;
    name: string;
    examDate: string;
    daysRemaining: number;
    dailyAvailableMinutes: number;
  };
  overall: OverallProgress;
  subjects: SubjectProgress[];
  pace: {
    minutesNeededPerDay: number | null;
    dailyAvailableMinutes: number;
    onTrack: boolean | null;
    weakestSubject: string | null;
  };
}

export interface SyllabusTemplate {
  id: string;
  examName: string;
  description: string | null;
  subjectCount: number;
  topicCount: number;
  subjectNames: string[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ------------------------------------------------------------------ reads --

export async function fetchTemplates(): Promise<SyllabusTemplate[]> {
  const { data } = await api.get<Envelope<{ templates: SyllabusTemplate[] }>>('/api/templates');
  return data.data.templates;
}

export async function fetchExams(): Promise<ExamSummary[]> {
  const { data } = await api.get<Envelope<{ exams: ExamSummary[] }>>('/api/exams');
  return data.data.exams;
}

export async function fetchExamProgress(examId: string): Promise<ExamProgress> {
  const { data } = await api.get<Envelope<ExamProgress>>(`/api/exams/${examId}/progress`);
  return data.data;
}

export async function fetchExamTree(examId: string): Promise<ExamTree> {
  const { data } = await api.get<Envelope<ExamTree>>(`/api/exams/${examId}`);
  return data.data;
}

// ----------------------------------------------------------------- writes --

export interface CreateExamPayload {
  name: string;
  examDate: string;
  dailyAvailableMinutes: number;
  templateId?: string;
}

export async function createExam(payload: CreateExamPayload): Promise<{ id: string }> {
  const { data } = await api.post<Envelope<{ exam: { id: string } }>>('/api/exams', payload);
  return data.data.exam;
}

export async function updateExam(
  examId: string,
  payload: Partial<{ name: string; examDate: string; dailyAvailableMinutes: number }>,
): Promise<void> {
  await api.patch(`/api/exams/${examId}`, payload);
}

export async function deleteExam(examId: string): Promise<void> {
  await api.delete(`/api/exams/${examId}`);
}

export async function createSubject(
  examId: string,
  payload: { name: string; weightage?: number },
): Promise<void> {
  await api.post(`/api/exams/${examId}/subjects`, payload);
}

export async function updateSubject(
  subjectId: string,
  payload: Partial<{ name: string; weightage: number | null }>,
): Promise<void> {
  await api.patch(`/api/subjects/${subjectId}`, payload);
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await api.delete(`/api/subjects/${subjectId}`);
}

export async function reorderSubjects(examId: string, ids: string[]): Promise<void> {
  await api.post(`/api/exams/${examId}/subjects/reorder`, { ids });
}

export async function createTopic(
  subjectId: string,
  payload: {
    name: string;
    parentTopicId?: string | null;
    estimatedMinutes?: number;
    difficulty?: Difficulty;
  },
): Promise<void> {
  await api.post(`/api/subjects/${subjectId}/topics`, payload);
}

export async function updateTopic(
  topicId: string,
  payload: Partial<{
    name: string;
    estimatedMinutes: number;
    difficulty: Difficulty;
    isStarred: boolean;
    isFrequentlyAsked: boolean;
  }>,
): Promise<void> {
  await api.patch(`/api/topics/${topicId}`, payload);
}

export async function updateTopicStatus(
  topicId: string,
  payload: { status: TopicStatus; difficulty?: Difficulty },
): Promise<void> {
  await api.patch(`/api/topics/${topicId}/status`, payload);
}

export async function deleteTopic(topicId: string): Promise<void> {
  await api.delete(`/api/topics/${topicId}`);
}

// ---------------------------------------------------------------- display --

export const STATUS_LABELS: Record<TopicStatus, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  COMPLETED_REVISION_DUE: 'Revision due',
  WELL_REVISED: 'Well revised',
};

/** Tailwind classes per status, matching the red/amber/orange/green scheme. */
export const STATUS_CLASSES: Record<TopicStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  LEARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  COMPLETED_REVISION_DUE: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  WELL_REVISED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

/**
 * Short labels for dense lists. "Not started yet" repeated down twenty rows
 * reads as an unfinished interface; a one-word chip reads as a state.
 */
export const STATUS_SHORT: Record<TopicStatus, string> = {
  NOT_STARTED: 'New',
  LEARNING: 'In progress',
  COMPLETED_REVISION_DUE: 'Review',
  WELL_REVISED: 'Done',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MODERATE: 'Moderate',
  DIFFICULT: 'Difficult',
};

export const DIFFICULTY_CLASSES: Record<Difficulty, string> = {
  EASY: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  MODERATE: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  DIFFICULT: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

/** Clicking the difficulty chip cycles through the three levels. */
export const NEXT_DIFFICULTY: Record<Difficulty, Difficulty> = {
  EASY: 'MODERATE',
  MODERATE: 'DIFFICULT',
  DIFFICULT: 'EASY',
};

export const STATUS_ORDER: TopicStatus[] = [
  'NOT_STARTED',
  'LEARNING',
  'COMPLETED_REVISION_DUE',
  'WELL_REVISED',
];

export function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
