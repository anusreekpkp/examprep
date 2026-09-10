import { api } from './api';

export interface ParsedTopic {
  name: string;
  children: ParsedTopic[];
}

export interface ParsedSubject {
  name: string;
  topics: ParsedTopic[];
}

export interface SyllabusImportRecord {
  id: string;
  fileName: string;
  source: 'PDF_TEXT' | 'IMAGE_OCR';
  characterCount: number;
  createdAt: string;
  appliedAt?: string | null;
  /** Present on the listing endpoint, absent on a fresh upload response. */
  subjectsCreated?: number;
  topicsCreated?: number;
  /** Only returned for a fresh upload, where the PDF was just parsed. */
  pageCount?: number;
}

export interface ImportResult {
  import: SyllabusImportRecord;
  preview: {
    subjects: ParsedSubject[];
    unmatchedLines: string[];
  };
  extractedText: string;
}

export interface StoredImport extends SyllabusImportRecord {
  extractedText: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const ACCEPT_ATTRIBUTE = '.pdf,image/png,image/jpeg,image/webp';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadSyllabus(examId: string, file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post<Envelope<ImportResult>>(
    `/api/exams/${examId}/syllabus-imports`,
    form,
    // The axios instance defaults to application/json; clearing it lets the
    // browser set multipart/form-data *with* the boundary, which is required.
    { headers: { 'Content-Type': undefined } },
  );
  return data.data;
}

export async function applyImport(
  importId: string,
  subjects: { name: string; topics: { name: string; children: string[] }[] }[],
): Promise<{ subjectsCreated: number; topicsCreated: number }> {
  const { data } = await api.post<Envelope<{ subjectsCreated: number; topicsCreated: number }>>(
    `/api/syllabus-imports/${importId}/apply`,
    { subjects },
  );
  return data.data;
}

export async function fetchImports(examId: string): Promise<SyllabusImportRecord[]> {
  const { data } = await api.get<Envelope<{ imports: SyllabusImportRecord[] }>>(
    `/api/exams/${examId}/syllabus-imports`,
  );
  return data.data.imports;
}

export async function deleteImport(importId: string): Promise<void> {
  await api.delete(`/api/syllabus-imports/${importId}`);
}

export async function fetchImportText(importId: string): Promise<StoredImport> {
  const { data } = await api.get<Envelope<{ import: StoredImport }>>(
    `/api/syllabus-imports/${importId}`,
  );
  return data.data.import;
}
