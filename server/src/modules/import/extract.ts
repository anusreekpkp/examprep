import { extractText, getDocumentProxy } from 'unpdf';
import { ApiError } from '../../utils/ApiError.js';

export type ExtractionSource = 'PDF_TEXT' | 'IMAGE_OCR';

export interface ExtractionResult {
  text: string;
  source: ExtractionSource;
  /** Pages for a PDF, always 1 for an image. */
  pageCount: number;
}

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Pulls text out of an uploaded syllabus. The buffer never touches disk: Render's
 * free instances get a fresh filesystem on every deploy, so anything written
 * there disappears without warning. Only the extracted text is persisted.
 */
export async function extractSyllabusText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  if (mimeType === 'application/pdf') {
    return extractFromPdf(buffer);
  }
  if (mimeType.startsWith('image/')) {
    return extractFromImage(buffer);
  }
  throw ApiError.badRequest(`Unsupported file type "${mimeType}". Upload a PDF or an image.`);
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join('\n') : text;

    if (merged.trim().length === 0) {
      // A scanned syllabus is an image wrapped in a PDF: there is no text layer
      // to read, so say that rather than returning an empty tree.
      throw ApiError.badRequest(
        'This PDF has no selectable text - it looks like a scan. Export a photo of the pages and upload that instead, so it can be read with OCR.',
      );
    }

    return { text: merged, source: 'PDF_TEXT', pageCount: totalPages };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Could not read that PDF. It may be encrypted or corrupted.');
  }
}

async function extractFromImage(buffer: Buffer): Promise<ExtractionResult> {
  // Imported lazily: tesseract pulls in a large worker and a language model, and
  // most requests never touch an image.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    if (data.text.trim().length === 0) {
      throw ApiError.badRequest(
        'No text could be read from that image. A sharper, straight-on photo usually works better.',
      );
    }
    return { text: data.text, source: 'IMAGE_OCR', pageCount: 1 };
  } finally {
    await worker.terminate();
  }
}
