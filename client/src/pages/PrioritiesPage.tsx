import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Card } from '@/components/ui';
import { PriorityRow } from '@/components/PriorityRow';
import { usePriorities } from '@/hooks/usePriorities';
import { extractErrorMessage } from '@/lib/api';
import { COMPONENT_COLORS, COMPONENT_LABELS, COMPONENT_ORDER } from '@/lib/priorities';

export default function PrioritiesPage() {
  const { data, isPending, isError, error } = usePriorities(undefined, 25);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">What to study next</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every topic is scored from the signals this exam actually has, minus a penalty for
          anything you studied in the last few days. The bar under each row shows exactly where
          its score came from.
        </p>
      </div>

      {isError && <Alert>{extractErrorMessage(error, 'Could not work out your priorities')}</Alert>}
      {isPending && <p className="text-sm text-slate-500">Scoring your topics…</p>}

      {data && data.count === 0 && (
        <Card>
          <h2 className="font-medium">Nothing to rank yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add an exam and a syllabus, and every topic will be scored here.
          </p>
          <Link to="/exams/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
            Add an exam →
          </Link>
        </Card>
      )}

      {data && data.count > 0 && (
        <>
          <Card className="mb-4">
            <p className="text-sm font-medium">
              How the score is built{' '}
              <span className="font-normal text-slate-400">· out of {data.maxScore}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
              {COMPONENT_ORDER.map((key) => {
                // Exam weight is greyed out and explicitly marked unavailable
                // rather than quietly listed, when the exam publishes none.
                const unavailable = key === 'examWeight' && !data.hasWeightageData;
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1.5 ${unavailable ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`inline-block size-2.5 rounded-full ${
                        unavailable ? 'bg-slate-300 dark:bg-slate-700' : COMPONENT_COLORS[key]
                      }`}
                    />
                    {COMPONENT_LABELS[key]}
                    <span className="text-slate-400">
                      {unavailable ? 'no data' : `up to ${data.weights.components[key]}`}
                    </span>
                  </span>
                );
              })}
              <span className="text-slate-400">
                − up to {data.weights.recencyPenaltyMax} for recent study
              </span>
            </div>

            {!data.hasWeightageData && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800">
                None of your exams record subject weightage, so nothing here claims to know which
                subjects carry the most marks — a syllabus lists what is examinable, not how the
                marks are split. Ranking uses your coverage, the topics you marked difficult, your
                mock accuracy, revisions that have fallen due and the days left, and spreads
                equally-ranked topics across subjects. Enter weightage on a subject if your exam
                publishes it and that signal switches on.
              </p>
            )}
          </Card>

          <p className="mb-3 text-sm text-slate-500">
            {data.count} topics ranked · showing the top {data.topics.length}
          </p>

          <ol className="space-y-3">
            {data.topics.map((entry, index) => (
              <PriorityRow key={entry.topic.id} entry={entry} rank={index + 1} />
            ))}
          </ol>
        </>
      )}
    </AppShell>
  );
}
