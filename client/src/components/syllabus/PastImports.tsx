import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Card } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { deleteImport, fetchImportText, fetchImports } from '@/lib/imports';

/**
 * The uploaded file is discarded, but its text is kept. Without somewhere to
 * read it back, "stored" would be invisible to the student - so past uploads
 * are listed here, and can be reopened or removed.
 */
export function PastImports({
  examId,
  onResume,
}: {
  examId: string;
  /** Reopens an upload that was never imported, using its stored text. */
  onResume: (importId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importsKey = ['exams', examId, 'imports'];

  const { data: imports } = useQuery({
    queryKey: importsKey,
    queryFn: () => fetchImports(examId),
  });

  const { data: opened, isPending: textLoading } = useQuery({
    queryKey: ['syllabus-imports', openId],
    queryFn: () => fetchImportText(openId as string),
    enabled: Boolean(openId),
  });

  const remove = useMutation({
    mutationFn: deleteImport,
    onSuccess: async (_result, importId) => {
      if (openId === importId) setOpenId(null);
      await queryClient.invalidateQueries({ queryKey: importsKey });
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not remove that upload')),
  });

  if (!imports || imports.length === 0) return null;

  const pendingCount = imports.filter((record) => !record.appliedAt).length;

  const handleRemove = (id: string, fileName: string, applied: boolean) => {
    setError(null);
    const warning = applied
      ? `Remove the stored text of "${fileName}"?\n\nThe subjects and topics it created stay in your syllabus — only the saved text is deleted.`
      : `Remove the stored text of "${fileName}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    remove.mutate(id);
  };

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-medium">Uploaded syllabi</h3>
      <p className="mt-1 text-xs text-slate-500">
        The files themselves are not kept, but their text is stored, so an upload you did not
        finish importing can be picked back up without uploading it again.
      </p>

      {pendingCount > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {pendingCount === 1
            ? 'One upload has not been imported yet, so none of its topics are in your syllabus.'
            : `${pendingCount} uploads have not been imported yet, so none of their topics are in your syllabus.`}{' '}
          Use <strong>Review &amp; import</strong> to finish.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {imports.map((record) => {
          const applied = Boolean(record.appliedAt);
          return (
            <li key={record.id} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{record.fileName}</span>
                <span className="text-xs text-slate-500">
                  {record.source === 'IMAGE_OCR' ? 'OCR' : 'PDF text'} ·{' '}
                  {record.characterCount.toLocaleString()} chars ·{' '}
                  {new Date(record.createdAt).toLocaleDateString()}
                    {applied
                    ? ` · imported ${record.subjectsCreated ?? 0} subjects, ${record.topicsCreated ?? 0} topics`
                    : ''}
                </span>

                {!applied && (
                  <button
                    type="button"
                    onClick={() => onResume(record.id)}
                    className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-700"
                  >
                    Review &amp; import
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenId(openId === record.id ? null : record.id)}
                  className="text-xs text-brand-600 hover:underline"
                >
                  {openId === record.id ? 'Hide text' : 'View text'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(record.id, record.fileName, applied)}
                  disabled={remove.isPending}
                  className="text-xs text-slate-400 transition hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>

              {openId === record.id && (
                <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-950">
                  {textLoading ? 'Loading…' : (opened?.extractedText ?? '')}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
