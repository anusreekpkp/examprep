import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { examKeys } from '@/hooks/useSyllabus';
import {
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  applyImport,
  uploadSyllabus,
  type ImportResult,
} from '@/lib/imports';

interface DraftSubject {
  include: boolean;
  name: string;
  /**
   * One topic per line, with sub-topics indented by two spaces. Plain text is
   * the fastest thing to tidy by hand, and indentation is a familiar way to
   * express nesting without a drag-and-drop tree.
   */
  topicsText: string;
}

/** An indented line becomes a sub-topic of the line above it. */
function parseTopicsText(text: string): { name: string; children: string[] }[] {
  const topics: { name: string; children: string[] }[] = [];

  for (const rawLine of text.split('\n')) {
    const name = rawLine.trim();
    if (!name) continue;
    const isChild = /^\s/.test(rawLine);
    const parent = topics.at(-1);
    // An indented first line has no parent to attach to, so it is promoted.
    if (isChild && parent) parent.children.push(name);
    else topics.push({ name, children: [] });
  }

  return topics;
}

function toTopicsText(topics: { name: string; children: { name: string }[] }[]): string {
  return topics
    .map((topic) => [topic.name, ...topic.children.map((child) => `  ${child.name}`)].join('\n'))
    .join('\n');
}

/**
 * Upload -> parse -> review -> apply. Nothing is written to the syllabus until
 * the student presses Import, because heading detection on a real syllabus PDF
 * is a best guess and always needs a human pass.
 */
export function ImportSyllabusDialog({
  examId,
  onClose,
  onImported,
}: {
  examId: string;
  onClose: () => void;
  onImported: (summary: { subjectsCreated: number; topicsCreated: number }) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'pick' | 'uploading' | 'review' | 'applying'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drafts, setDrafts] = useState<DraftSubject[]>([]);
  const [showText, setShowText] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than the 10 MB limit.');
      return;
    }

    setStage('uploading');
    try {
      const uploaded = await uploadSyllabus(examId, file);
      setResult(uploaded);
      setDrafts(
        uploaded.preview.subjects.map((subject) => ({
          include: true,
          name: subject.name,
          topicsText: toTopicsText(subject.topics),
        })),
      );
      setStage('review');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not read that file'));
      setStage('pick');
    }
  };

  const handleApply = async () => {
    if (!result) return;
    setError(null);
    setStage('applying');

    const subjects = drafts
      .filter((draft) => draft.include && draft.name.trim())
      .map((draft) => ({
        name: draft.name.trim(),
        topics: parseTopicsText(draft.topicsText),
      }))
      .filter((subject) => subject.topics.length > 0);

    if (subjects.length === 0) {
      setError('Keep at least one subject with at least one topic.');
      setStage('review');
      return;
    }

    try {
      const summary = await applyImport(result.import.id, subjects);
      await queryClient.invalidateQueries({ queryKey: examKeys.all });
      await queryClient.invalidateQueries({ queryKey: examKeys.tree(examId) });
      await queryClient.invalidateQueries({ queryKey: ['exams', examId, 'imports'] });
      onImported(summary);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not import the syllabus'));
      setStage('review');
    }
  };

  const totalTopics = drafts
    .filter((d) => d.include)
    .reduce((sum, d) => sum + d.topicsText.split('\n').filter((l) => l.trim()).length, 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Import a syllabus</h3>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {stage === 'pick' && (
        <div className="mt-3">
          <p className="text-sm text-slate-500">
            Upload a PDF or a photo of your syllabus. The text is read and stored; the file
            itself is not kept. You review everything before it is added.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so picking the same file twice still fires onChange.
              event.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
            Choose PDF or image
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            PDF, PNG, JPEG or WebP · up to 10 MB. Scanned PDFs have no text layer — photograph
            the page and upload that instead.
          </p>
        </div>
      )}

      {stage === 'uploading' && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          Reading the file… images take a few seconds longer, since the text has to be recognised.
        </p>
      )}

      {(stage === 'review' || stage === 'applying') && result && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {result.import.fileName}
            </span>
            <span>
              {result.import.source === 'IMAGE_OCR' ? 'read with OCR' : 'text read from PDF'} ·{' '}
              {result.import.characterCount.toLocaleString()} characters stored
            </span>
            <button
              type="button"
              onClick={() => setShowText((open) => !open)}
              className="text-brand-600 hover:underline"
            >
              {showText ? 'Hide' : 'Show'} extracted text
            </button>
          </div>

          {showText && (
            <pre className="max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-950">
              {result.extractedText}
            </pre>
          )}

          {result.preview.unmatchedLines.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              {result.preview.unmatchedLines.length} line
              {result.preview.unmatchedLines.length === 1 ? '' : 's'} could not be placed under a
              subject. They are in the extracted text above if you want to add them by hand.
            </p>
          )}

          {drafts.length === 0 ? (
            <Alert>
              No subjects could be recognised in that file. Check the extracted text — you may
              need to add the subjects manually.
            </Alert>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Edit anything below before importing. One topic per line; indent a line
                with two spaces to make it a sub-topic.
              </p>

              <div className="space-y-3">
                {drafts.map((draft, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-3 transition ${
                      draft.include
                        ? 'border-slate-200 dark:border-slate-800'
                        : 'border-dashed border-slate-200 opacity-50 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.include}
                        aria-label={`Include ${draft.name}`}
                        onChange={(event) =>
                          setDrafts((current) =>
                            current.map((d, i) =>
                              i === index ? { ...d, include: event.target.checked } : d,
                            ),
                          )
                        }
                        className="size-4 shrink-0 accent-brand-600"
                      />
                      <Input
                        value={draft.name}
                        aria-label={`Subject name ${index + 1}`}
                        onChange={(event) =>
                          setDrafts((current) =>
                            current.map((d, i) =>
                              i === index ? { ...d, name: event.target.value } : d,
                            ),
                          )
                        }
                      />
                    </div>
                    <textarea
                      value={draft.topicsText}
                      aria-label={`Topics for ${draft.name}`}
                      rows={Math.min(10, Math.max(3, draft.topicsText.split('\n').length))}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((d, i) =>
                            i === index ? { ...d, topicsText: event.target.value } : d,
                          ),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void handleApply()} isLoading={stage === 'applying'}>
                  Import {drafts.filter((d) => d.include).length} subjects · {totalTopics} topics
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
