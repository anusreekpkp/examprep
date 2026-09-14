import { Link } from 'react-router-dom';
import {
  COMPONENT_COLORS,
  COMPONENT_LABELS,
  COMPONENT_ORDER,
  type RankedTopic,
} from '@/lib/priorities';
import { STATUS_CLASSES, STATUS_LABELS, formatMinutes } from '@/lib/syllabus';

/**
 * Shows *why* a topic was ranked where it was. The stacked bar is the whole
 * point of the feature: a score with no visible reasoning is just an oracle,
 * and a student has no way to disagree with an oracle.
 */
export function PriorityRow({ entry, rank }: { entry: RankedTopic; rank: number }) {
  const { topic, components, recencyPenalty, score, reasons } = entry;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
            {rank}
          </span>
          <div className="min-w-0">
            <p className="font-medium">
              {topic.isStarred && <span className="mr-1 text-amber-500">★</span>}
              {topic.name}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {topic.subjectName} · {topic.examName} · {formatMinutes(topic.estimatedMinutes)}
            </p>
            <p className="mt-1 text-sm">
              {reasons.map((reason, index) => (
                <span key={reason}>
                  {index > 0 && <span className="text-slate-400"> + </span>}
                  <span className="text-slate-700 dark:text-slate-200">{reason}</span>
                </span>
              ))}
              {topic.daysOverdue !== null && topic.daysOverdue > 0 && (
                <span className="ml-2 text-red-600 dark:text-red-400">
                  ({topic.daysOverdue}d late)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[topic.status]}`}
          >
            {STATUS_LABELS[topic.status]}
          </span>
          <span className="text-right">
            <span className="block text-lg font-semibold tabular-nums text-brand-600">
              {score}
            </span>
            <span className="block text-xs text-slate-400">score</span>
          </span>
        </div>
      </div>

      {/* Stacked contribution bar, drawn to the same 0-100 scale as the score. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {COMPONENT_ORDER.filter((key) => components[key] > 0).map((key) => (
          <div
            key={key}
            className={COMPONENT_COLORS[key]}
            style={{ width: `${components[key]}%` }}
            title={`${COMPONENT_LABELS[key]}: ${components[key]}`}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {COMPONENT_ORDER.filter((key) => components[key] > 0).map((key) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className={`inline-block size-2 rounded-full ${COMPONENT_COLORS[key]}`} />
            {COMPONENT_LABELS[key]} {components[key]}
          </span>
        ))}
        {recencyPenalty > 0 && (
          <span className="text-slate-400">
            − {recencyPenalty} studied {topic.daysSinceStudied === 0 ? 'today' : 'recently'}
          </span>
        )}
        <Link
          to={`/exams/${topic.examId}`}
          className="ml-auto text-brand-600 hover:underline"
        >
          Open syllabus →
        </Link>
      </div>
    </li>
  );
}
