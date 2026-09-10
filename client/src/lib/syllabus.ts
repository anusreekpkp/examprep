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
  weightage: number;
  colorHex: string | null;
  topicCount: number;
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
    totalTopics: number;
    notStarted: number;
    learning: number;
    revisionDue: number;
    wellRevised: number;
    starred: number;
    estimatedMinutesRemaining: number;
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
  payload: Partial<{ name: string; weightage: number }>,
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

export function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
