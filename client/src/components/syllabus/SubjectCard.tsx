import { useState } from 'react';
import type { SubjectNode, TopicNode } from '@/lib/syllabus';
import { Card } from '@/components/ui';
import { InlineForm } from './InlineForm';
import { TopicRow } from './TopicRow';

interface SubjectCardProps {
  subject: SubjectNode;
  isFirst: boolean;
  isLast: boolean;
  onRenameSubject: (subjectId: string, name: string) => Promise<void>;
  onDeleteSubject: (subject: SubjectNode) => void;
  onMove: (subjectId: string, direction: -1 | 1) => void;
  onAddTopic: (subjectId: string, name: string, parentTopicId?: string | null) => Promise<void>;
  onRenameTopic: (topicId: string, name: string) => Promise<void>;
  onDeleteTopic: (topicId: string, name: string, childCount: number) => void;
  onToggleStar: (topic: TopicNode) => void;
}

export function SubjectCard({
  subject,
  isFirst,
  isLast,
  onRenameSubject,
  onDeleteSubject,
  onMove,
  onAddTopic,
  onRenameTopic,
  onDeleteTopic,
  onToggleStar,
}: SubjectCardProps) {
  // Collapsed by default would hide a 13-topic subject behind a click; expanded
  // by default matches how a student scans a syllabus.
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<'view' | 'rename' | 'addTopic'>('view');

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <span className="sr-only">{isOpen ? 'Collapse' : 'Expand'} {subject.name}</span>
        </button>

        {mode === 'rename' ? (
          <InlineForm
            placeholder="Subject name"
            initialValue={subject.name}
            submitLabel="Save"
            onSubmit={async (value) => {
              await onRenameSubject(subject.id, value);
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate font-medium">{subject.name}</h3>

            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {subject.topicCount} {subject.topicCount === 1 ? 'topic' : 'topics'}
            </span>
            <span className="shrink-0 text-xs text-slate-400">{subject.weightage}% weight</span>

            <span className="flex shrink-0 items-center gap-1">
              <IconAction
                label={`Move ${subject.name} up`}
                disabled={isFirst}
                onClick={() => onMove(subject.id, -1)}
              >
                ↑
              </IconAction>
              <IconAction
                label={`Move ${subject.name} down`}
                disabled={isLast}
                onClick={() => onMove(subject.id, 1)}
              >
                ↓
              </IconAction>
              <TextAction onClick={() => setMode('addTopic')}>+ topic</TextAction>
              <TextAction onClick={() => setMode('rename')}>Rename</TextAction>
              <TextAction danger onClick={() => onDeleteSubject(subject)}>
                Delete
              </TextAction>
            </span>
          </>
        )}
      </div>

      {mode === 'addTopic' && (
        <div className="mt-3 pl-8">
          <InlineForm
            placeholder="Topic name"
            submitLabel="Add"
            onSubmit={async (value) => {
              await onAddTopic(subject.id, value, null);
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      )}

      {isOpen && (
        <>
          {subject.topics.length === 0 ? (
            <p className="mt-3 pl-8 text-sm text-slate-500">
              No topics yet. Use <span className="font-medium">+ topic</span> to add the first one.
            </p>
          ) : (
            <ul className="mt-2">
              {subject.topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  depth={1}
                  onRename={onRenameTopic}
                  onDelete={onDeleteTopic}
                  onToggleStar={onToggleStar}
                  onAddChild={(parentTopicId, name) =>
                    onAddTopic(subject.id, name, parentTopicId)
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function IconAction({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}

function TextAction({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-xs transition ${
        danger
          ? 'text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
