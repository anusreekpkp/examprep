import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Card, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { useExams } from '@/hooks/useSyllabus';
import { useExamNotes } from '@/hooks/useNotes';
import {
  NOTE_TYPE_CLASSES,
  NOTE_TYPE_LABELS,
  NOTE_TYPE_ORDER,
  firstUrl,
  type NoteType,
} from '@/lib/notes';

export default function NotesPage() {
  const { data: exams } = useExams();
  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<NoteType | 'ALL'>('ALL');

  const { data, isPending, isError, error } = useExamNotes(nextExam?.id, search);

  const notes = useMemo(
    () => (data?.notes ?? []).filter((note) => typeFilter === 'ALL' || note.type === typeFilter),
    [data, typeFilter],
  );

  /** Counts come from the unfiltered set, so a tab never shows a misleading zero. */
  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of data?.notes ?? []) counts[note.type] = (counts[note.type] ?? 0) + 1;
    return counts;
  }, [data]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Notes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything you have written against a topic, in one place. Search covers titles, bodies
          and topic names.
        </p>
      </div>

      {isError && <Alert>{extractErrorMessage(error, 'Could not load your notes')}</Alert>}

      {!nextExam && (
        <Card>
          <p className="text-sm text-slate-500">
            Add an exam and a syllabus first —{' '}
            <Link to="/exams" className="text-brand-600 hover:underline">
              go to your syllabus
            </Link>
            .
          </p>
        </Card>
      )}

      {nextExam && (
        <>
          <Card className="mb-4">
            <Input
              type="search"
              value={search}
              placeholder="Search your notes…"
              aria-label="Search notes"
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              <FilterChip
                label={`All ${data?.notes.length ?? 0}`}
                active={typeFilter === 'ALL'}
                onClick={() => setTypeFilter('ALL')}
              />
              {NOTE_TYPE_ORDER.filter((type) => (countsByType[type] ?? 0) > 0).map((type) => (
                <FilterChip
                  key={type}
                  label={`${NOTE_TYPE_LABELS[type]} ${countsByType[type]}`}
                  active={typeFilter === type}
                  onClick={() => setTypeFilter(type)}
                />
              ))}
            </div>
          </Card>

          {isPending && <p className="text-sm text-slate-500">Loading…</p>}

          {data && notes.length === 0 && (
            <Card>
              <h2 className="font-medium">
                {search ? 'Nothing matched that search' : 'No notes yet'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {search
                  ? 'Try a shorter search term.'
                  : 'Open a topic in your syllabus and use its Notes action to write the first one.'}
              </p>
              {!search && (
                <Link
                  to={`/exams/${nextExam.id}`}
                  className="mt-3 inline-block text-sm text-brand-600 hover:underline"
                >
                  Open the syllabus →
                </Link>
              )}
            </Card>
          )}

          <ul className="space-y-3">
            {notes.map((note) => {
              const url = note.type === 'LINK' ? firstUrl(note.content) : null;
              return (
                <li key={note.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      {note.isPinned && <span className="text-amber-500">★</span>}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${NOTE_TYPE_CLASSES[note.type]}`}
                      >
                        {NOTE_TYPE_LABELS[note.type]}
                      </span>
                      <span className="font-medium">{note.title}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {new Date(note.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      <Link
                        to={`/exams/${note.topic.subject.examId}`}
                        className="hover:underline"
                      >
                        {note.topic.subject.name} · {note.topic.name}
                      </Link>
                    </p>

                    <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                      {note.content}
                    </p>

                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-block text-xs text-brand-600 hover:underline"
                      >
                        Open link →
                      </a>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AppShell>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
