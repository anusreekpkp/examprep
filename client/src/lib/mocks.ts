import { api } from './api';

export interface MockSection {
  id: string;
  name: string;
  subjectId: string | null;
  subjectName: string | null;
  attempted: number;
  correct: number;
  incorrect: number;
  marks: number;
  maxMarks: number;
  accuracy: number | null;
  scorePercent: number | null;
}

export interface MockTest {
  id: string;
  name: string;
  attemptNumber: number | null;
  takenAt: string;
  durationMinutes: number | null;
  totalMarks: number;
  obtainedMarks: number;
  notes: string | null;
  scorePercent: number | null;
  accuracy: number | null;
  attempted: number;
  correct: number;
  sections: MockSection[];
}

export interface SubjectAccuracy {
  subjectId: string | null;
  subjectName: string;
  attempted: number;
  correct: number;
  accuracy: number | null;
  marks: number;
  maxMarks: number;
  scorePercent: number | null;
}

export interface MockAnalysis {
  count: number;
  trend: {
    id: string;
    name: string;
    attemptNumber: number | null;
    takenAt: string;
    scorePercent: number | null;
    accuracy: number | null;
  }[];
  subjects: SubjectAccuracy[];
  weakestSubjects: SubjectAccuracy[];
  improvement: number | null;
  averageScorePercent: number | null;
}

export interface NewMockSection {
  subjectId?: string | null;
  name: string;
  attempted: number;
  correct: number;
  marks: number;
  maxMarks: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export async function fetchMocks(examId: string): Promise<MockTest[]> {
  const { data } = await api.get<Envelope<{ mocks: MockTest[] }>>(
    `/api/exams/${examId}/mock-tests`,
  );
  return data.data.mocks;
}

export async function fetchMockAnalysis(examId: string): Promise<MockAnalysis> {
  const { data } = await api.get<Envelope<MockAnalysis>>(
    `/api/exams/${examId}/mock-tests/analysis`,
  );
  return data.data;
}

export async function createMock(
  examId: string,
  payload: {
    name: string;
    takenAt: string;
    durationMinutes?: number;
    notes?: string;
    sections: NewMockSection[];
  },
): Promise<MockTest> {
  const { data } = await api.post<Envelope<{ mock: MockTest }>>(
    `/api/exams/${examId}/mock-tests`,
    payload,
  );
  return data.data.mock;
}

export async function deleteMock(mockId: string): Promise<void> {
  await api.delete(`/api/mock-tests/${mockId}`);
}

/** Red below 50, amber below 70, green above - the same bands used elsewhere. */
export function accuracyClass(accuracy: number | null): string {
  if (accuracy === null) return 'text-slate-500';
  if (accuracy < 50) return 'text-red-600 dark:text-red-400';
  if (accuracy < 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}
