import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { fetchImportText, fetchImports } from '@/lib/imports';

/**
 * The uploaded file is discarded, but its text is kept. Without somewhere to
 * read it back, "stored" would be invisible to the student - so past uploads
 * are listed here and the text can be reopened at any time.
 */
export function PastImports({ examId }: { examId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: imports } = useQuery({
    queryKey: ['exams', examId, 'imports'],
    queryFn: () => fetchImports(examId),
  });

  const { data: opened, isPending: textLoading } = useQuery({
    queryKey: ['syllabus-imports', openId],
    queryFn: () => fetchImportText(openId as string),
    enabled: Boolean(openId),
  });

  if (!imports || imports.length === 0) return null;

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-medium">Uploaded syllabi</h3>
      <p className="mt-1 text-xs text-slate-500">
        The files themselves are not kept, but their text is stored and can be reopened.
      </p>

      <ul className="mt-3 space-y-2">
        {imports.map((record) => (
          <li key={record.id} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">{record.fileName}</span>
              <span className="text-xs text-slate-500">
                {record.source === 'IMAGE_OCR' ? 'OCR' : 'PDF text'} ·{' '}
                {record.characterCount.toLocaleString()} chars ·{' '}
                {new Date(record.createdAt).toLocaleDateString()}
                {record.appliedAt
                  ? ` · imported ${record.subjectsCreated ?? 0} subjects, ${record.topicsCreated ?? 0} topics`
                  : ' · not imported'}
              </span>
              <button
                type="button"
                onClick={() => setOpenId(openId === record.id ? null : record.id)}
                className="text-xs text-brand-600 hover:underline"
              >
                {openId === record.id ? 'Hide text' : 'View text'}
              </button>
            </div>

            {openId === record.id && (
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:bg-slate-950">
                {textLoading ? 'Loading…' : (opened?.extractedText ?? '')}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
