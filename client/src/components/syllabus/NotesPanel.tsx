import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import {
  NOTE_TYPE_CLASSES,
  NOTE_TYPE_LABELS,
  NOTE_TYPE_ORDER,
  firstUrl,
  type NoteType,
} from '@/lib/notes';
import { useCreateNote, useDeleteNote, useTopicNotes, useUpdateNote } from '@/hooks/useNotes';

/**
 * Notes for one topic, opened inline from its row. Kept in place rather than on
 * a separate screen because a note is written while the topic is in front of
 * you - a formula you just got wrong, a question that keeps coming up.
 */
export function NotesPanel({ topicId, topicName }: { topicId: string; topicName: string }) {
  const { data: notes, isPending } = useTopicNotes(topicId);
  const create = useCreateNote();
  const update = useUpdateNote();
  const remove = useDeleteNote();

  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<NoteType>('PERSONAL');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setContent('');
    setType('PERSONAL');
    setIsAdding(false);
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim() || !content.trim()) {
      setError('A note needs both a title and some content.');
      return;
    }
    try {
      await create.mutateAsync({ topicId, type, title: title.trim(), content: content.trim() });
      reset();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save that note'));
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Notes · {topicName}
        </p>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="rounded px-2 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50 dark:hover:bg-brand-700/20"
          >
            + Add note
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}

      {isAdding && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Type" htmlFor={`type-${topicId}`}>
              <select
                id={`type-${topicId}`}
                value={type}
                onChange={(event) => setType(event.target.value as NoteType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-950"
              >
                {NOTE_TYPE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {NOTE_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" htmlFor={`title-${topicId}`}>
              <Input
                id={`title-${topicId}`}
                value={title}
                placeholder={
                  type === 'FORMULA'
                    ? 'Successive percentage change'
                    : type === 'QUESTION'
                      ? 'Kerala PSC 2024 — Fundamental Rights'
                      : 'What I keep forgetting'
                }
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label={type === 'LINK' ? 'URL and any comment' : 'Content'}
            htmlFor={`content-${topicId}`}
            hint="Plain text or Markdown."
          >
            <textarea
              id={`content-${topicId}`}
              value={content}
              rows={4}
              placeholder={
                type === 'FORMULA'
                  ? 'Net change = a + b + ab/100'
                  : type === 'LINK'
                    ? 'https://… — why this is worth coming back to'
                    : 'Write it in your own words — that is the point.'
              }
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-950"
            />
          </Field>

          <div className="flex gap-2">
            <Button onClick={() => void handleSave()} isLoading={create.isPending}>
              Save note
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isPending && <p className="mt-2 text-xs text-slate-500">Loading notes…</p>}

      {notes && notes.length === 0 && !isAdding && (
        <p className="mt-2 text-xs text-slate-500">
          No notes on this topic yet. Formulas, past questions and your own wording all live here.
        </p>
      )}

      {notes && notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => {
            const url = note.type === 'LINK' ? firstUrl(note.content) : null;
            return (
              <li
                key={note.id}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${NOTE_TYPE_CLASSES[note.type]}`}
                  >
                    {NOTE_TYPE_LABELS[note.type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{note.title}</span>

                  <button
                    type="button"
                    onClick={() =>
                      update.mutate({ noteId: note.id, isPinned: !note.isPinned })
                    }
                    aria-pressed={note.isPinned}
                    aria-label={note.isPinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                    className={`text-sm transition ${
                      note.isPinned ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                  >
                    {note.isPinned ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the note "${note.title}"?`)) {
                        remove.mutate(note.id);
                      }
                    }}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>

                <p className="mt-1.5 text-sm whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                  {note.content}
                </p>

                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                  >
                    Open link →
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
