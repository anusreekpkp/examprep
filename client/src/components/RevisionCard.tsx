import { Card } from '@/components/ui';
import { TOTAL_STAGES, describeDue, type DueRevision } from '@/lib/revisions';
import { formatMinutes, type Difficulty } from '@/lib/syllabus';

const FEEDBACK_BUTTONS: { value: Difficulty; label: string; className: string }[] = [
  {
    value: 'EASY',
    label: 'Easy',
    className:
      'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200',
  },
  {
    value: 'MODERATE',
    label: 'Moderate',
    className:
      'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
  },
  {
    value: 'DIFFICULT',
    label: 'Difficult',
    className: 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-200',
  },
];

interface RevisionCardProps {
  revision: DueRevision;
  isBusy: boolean;
  onRate: (feedback: Difficulty) => void;
  onSkip: () => void;
}

export function RevisionCard({ revision, isBusy, onRate, onSkip }: RevisionCardProps) {
  const { topic } = revision;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{topic.name}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {topic.subjectName} · {topic.examName}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Revision {revision.stage} of {TOTAL_STAGES}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              revision.isOverdue
                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                : 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
            }`}
          >
            {describeDue(revision.dueInDays)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-slate-500">How did it go?</span>
        {FEEDBACK_BUTTONS.map((button) => (
          <button
            key={button.value}
            type="button"
            disabled={isBusy}
            onClick={() => onRate(button.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${button.className}`}
          >
            {button.label}
          </button>
        ))}

        <button
          type="button"
          disabled={isBusy}
          onClick={onSkip}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          Skip to tomorrow
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        About {formatMinutes(topic.estimatedMinutes)} · revised {topic.revisionCount}{' '}
        {topic.revisionCount === 1 ? 'time' : 'times'} so far
      </p>
    </Card>
  );
}
