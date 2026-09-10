import { useState } from 'react';
import { STATUS_CLASSES, STATUS_LABELS, formatMinutes, type TopicNode } from '@/lib/syllabus';
import { InlineForm } from './InlineForm';

interface TopicRowProps {
  topic: TopicNode;
  depth: number;
  onRename: (topicId: string, name: string) => Promise<void>;
  onDelete: (topicId: string, name: string, childCount: number) => void;
  onToggleStar: (topic: TopicNode) => void;
  onAddChild: (parentTopicId: string, name: string) => Promise<void>;
}

export function TopicRow({
  topic,
  depth,
  onRename,
  onDelete,
  onToggleStar,
  onAddChild,
}: TopicRowProps) {
  const [mode, setMode] = useState<'view' | 'rename' | 'addChild'>('view');

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
        // Indent by nesting depth so sub-topics read as part of their parent.
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {mode === 'rename' ? (
          <InlineForm
            placeholder="Topic name"
            initialValue={topic.name}
            submitLabel="Save"
            onSubmit={async (value) => {
              await onRename(topic.id, value);
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onToggleStar(topic)}
              aria-label={topic.isStarred ? `Unstar ${topic.name}` : `Star ${topic.name}`}
              aria-pressed={topic.isStarred}
              className={`shrink-0 text-sm transition ${
                topic.isStarred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
              }`}
            >
              {topic.isStarred ? '★' : '☆'}
            </button>

            <span className="min-w-0 flex-1 truncate text-sm">{topic.name}</span>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[topic.status]}`}
            >
              {STATUS_LABELS[topic.status]}
            </span>

            <span className="shrink-0 text-xs text-slate-400 tabular-nums">
              {formatMinutes(topic.estimatedMinutes)}
            </span>

            <span className="flex shrink-0 gap-1">
              <RowAction onClick={() => setMode('addChild')}>+ sub</RowAction>
              <RowAction onClick={() => setMode('rename')}>Rename</RowAction>
              <RowAction
                onClick={() => onDelete(topic.id, topic.name, topic.children.length)}
                danger
              >
                Delete
              </RowAction>
            </span>
          </>
        )}
      </div>

      {mode === 'addChild' && (
        <div style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.5}rem` }} className="py-2">
          <InlineForm
            placeholder="Sub-topic name"
            submitLabel="Add"
            onSubmit={async (value) => {
              await onAddChild(topic.id, value);
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      )}

      {topic.children.length > 0 && (
        <ul>
          {topic.children.map((child) => (
            <TopicRow
              key={child.id}
              topic={child}
              depth={depth + 1}
              onRename={onRename}
              onDelete={onDelete}
              onToggleStar={onToggleStar}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RowAction({
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
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
