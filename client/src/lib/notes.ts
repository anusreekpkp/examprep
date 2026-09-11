import { api } from './api';

export type NoteType = 'FORMULA' | 'PERSONAL' | 'QUESTION' | 'SUMMARY' | 'LINK';

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  topic: {
    id: string;
    name: string;
    subject: { id: string; name: string; examId: string };
  };
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  FORMULA: 'Formula',
  PERSONAL: 'My note',
  QUESTION: 'Question',
  SUMMARY: 'Summary',
  LINK: 'Link',
};

/** Distinct hues per type so a formula and a past question are told apart at a glance. */
export const NOTE_TYPE_CLASSES: Record<NoteType, string> = {
  FORMULA: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  PERSONAL: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  QUESTION: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  SUMMARY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  LINK: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

export const NOTE_TYPE_ORDER: NoteType[] = ['PERSONAL', 'FORMULA', 'QUESTION', 'SUMMARY', 'LINK'];

export async function fetchTopicNotes(topicId: string): Promise<Note[]> {
  const { data } = await api.get<Envelope<{ notes: Note[] }>>(`/api/topics/${topicId}/notes`);
  return data.data.notes;
}

export async function fetchExamNotes(
  examId: string,
  search?: string,
): Promise<{ notes: Note[]; countsByTopic: Record<string, number> }> {
  const { data } = await api.get<
    Envelope<{ notes: Note[]; countsByTopic: Record<string, number> }>
  >(`/api/exams/${examId}/notes`, { params: search ? { search } : undefined });
  return data.data;
}

export async function createNote(
  topicId: string,
  payload: { type: NoteType; title: string; content: string; isPinned?: boolean },
): Promise<Note> {
  const { data } = await api.post<Envelope<{ note: Note }>>(
    `/api/topics/${topicId}/notes`,
    payload,
  );
  return data.data.note;
}

export async function updateNote(
  noteId: string,
  payload: Partial<{ type: NoteType; title: string; content: string; isPinned: boolean }>,
): Promise<Note> {
  const { data } = await api.patch<Envelope<{ note: Note }>>(`/api/notes/${noteId}`, payload);
  return data.data.note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/api/notes/${noteId}`);
}

/** A URL in a LINK note is the useful part, so pull it out for an anchor. */
export function firstUrl(content: string): string | null {
  return /https?:\/\/[^\s)]+/.exec(content)?.[0] ?? null;
}
