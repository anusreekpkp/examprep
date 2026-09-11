import { useState } from 'react';
import {
  DIFFICULTY_CLASSES,
  DIFFICULTY_LABELS,
  NEXT_DIFFICULTY,
  STATUS_CLASSES,
  STATUS_LABELS,
  STATUS_ORDER,
  formatMinutes,
  type Difficulty,
  type TopicNode,
  type TopicStatus,
} from '@/lib/syllabus';
import { InlineForm } from './InlineForm';
import { NotesPanel } from './NotesPanel';

interface TopicRowProps {
  topic: TopicNode;
  depth: number;
  onRename: (topicId: string, name: string) => Promise<void>;
  onDelete: (topicId: string, name: string, childCount: number) => void;
  onToggleStar: (topic: TopicNode) => void;
  onAddChild: (parentTopicId: string, name: string) => Promise<void>;
  onStatusChange: (topicId: string, status: TopicStatus) => void;
  onDifficultyChange: (topicId: string, difficulty: Difficulty) => void;
  onEstimateChange: (topicId: string, minutes: number) => Promise<void>;
  /** Note count for this topic, so the row can show a badge without its own query. */
  noteCount?: number;
  /** Counts keyed by topic id, passed down so sub-topics get badges too. */
  noteCounts?: Record<string, number>;
}

export function TopicRow({
  topic,
  depth,
  onRename,
  onDelete,
  onToggleStar,
  onAddChild,
  onStatusChange,
  onDifficultyChange,
  onEstimateChange,
  noteCount = 0,
  noteCounts,
}: TopicRowProps) {
  const [mode, setMode] = useState<'view' | 'rename' | 'addChild' | 'estimate'>('view');
  const [showNotes, setShowNotes] = useState(false);

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

            {/* A select rather than a cycling button: four states are too many
                to reach by repeated clicking, and this stays keyboard-usable. */}
            <select
              value={topic.status}
              onChange={(event) => onStatusChange(topic.id, event.target.value as TopicStatus)}
              aria-label={`Status of ${topic.name}`}
              className={`shrink-0 cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500/40 ${STATUS_CLASSES[topic.status]}`}
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onDifficultyChange(topic.id, NEXT_DIFFICULTY[topic.difficulty])}
              aria-label={`Difficulty of ${topic.name}: ${DIFFICULTY_LABELS[topic.difficulty]}. Click to change.`}
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition hover:opacity-80 ${DIFFICULTY_CLASSES[topic.difficulty]}`}
            >
              {DIFFICULTY_LABELS[topic.difficulty]}
            </button>

            {/* The estimate drives the "minutes a day to finish" pace figure,
                so it has to be editable or that number means nothing. */}
            <button
              type="button"
              onClick={() => setMode('estimate')}
              aria-label={`Estimated study time for ${topic.name}: ${topic.estimatedMinutes} minutes. Click to change.`}
              className="shrink-0 rounded px-1 text-xs text-slate-400 tabular-nums transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {formatMinutes(topic.estimatedMinutes)}
            </button>

            <span className="flex shrink-0 gap-1">
              <RowAction onClick={() => setShowNotes((open) => !open)}>
                {noteCount > 0 ? `Notes ${noteCount}` : 'Notes'}
              </RowAction>
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

      {showNotes && (
        <div style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }} className="py-2 pr-2">
          <NotesPanel topicId={topic.id} topicName={topic.name} />
        </div>
      )}

      {mode === 'estimate' && (
        <div style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }} className="py-2">
          <InlineForm
            placeholder="Minutes"
            inputType="number"
            min={5}
            max={600}
            initialValue={String(topic.estimatedMinutes)}
            submitLabel="Save"
            onSubmit={async (value) => {
              const minutes = Number(value);
              if (Number.isFinite(minutes)) await onEstimateChange(topic.id, minutes);
              setMode('view');
            }}
            onCancel={() => setMode('view')}
          />
        </div>
      )}

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
              onStatusChange={onStatusChange}
              onDifficultyChange={onDifficultyChange}
              onEstimateChange={onEstimateChange}
              noteCount={noteCounts?.[child.id] ?? 0}
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
