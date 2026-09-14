import { Card } from '@/components/ui';
import { formatMinutes, type ExamProgress } from '@/lib/syllabus';

/**
 * The spec's key idea: percentages alone are not actionable. These lines answer
 * "what is actually outstanding" - remaining, unrevised, weak - and whether the
 * student's stated daily hours are enough to finish in the days left.
 */
export function ProgressSummary({ progress }: { progress: ExamProgress }) {
  const { overall, pace, subjects, exam } = progress;
  const remaining = overall.notStarted + overall.learning;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Syllabus covered</span>
          <span className="text-sm tabular-nums text-slate-500">
            {overall.completionPercent}% · weighted by marks {overall.weightedReadiness}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${overall.completionPercent}%` }}
          />
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          <li>
            You have <strong className="tabular-nums">{remaining}</strong>{' '}
            {remaining === 1 ? 'topic' : 'topics'} still to study.
          </li>
          <li>
            <strong className="tabular-nums">{overall.neverRevised}</strong>{' '}
            {overall.neverRevised === 1 ? 'topic has' : 'topics have'} been completed but never
            revised.
          </li>
          <li>
            <strong className="tabular-nums">{overall.weakTopics}</strong>{' '}
            {overall.weakTopics === 1 ? 'topic is' : 'topics are'} marked difficult and not yet
            revised.
          </li>
        </ul>

        {pace.minutesNeededPerDay !== null && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              pace.onTrack
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
            }`}
          >
            {pace.onTrack
              ? `On track: ${formatMinutes(pace.minutesNeededPerDay)} a day finishes the syllabus in ${exam.daysRemaining} days, within your ${formatMinutes(pace.dailyAvailableMinutes)}.`
              : `Behind: finishing in ${exam.daysRemaining} days needs ${formatMinutes(pace.minutesNeededPerDay)} a day, more than the ${formatMinutes(pace.dailyAvailableMinutes)} you set aside.`}
          </p>
        )}

        {pace.weakestSubject && overall.completionPercent > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            Weakest subject right now: <strong>{pace.weakestSubject}</strong>.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-medium">By subject</h3>
        <ul className="mt-3 space-y-3">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{subject.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {subject.completionPercent}%
                  {subject.weakTopics > 0 && (
                    <span className="ml-2 text-red-600 dark:text-red-400">
                      {subject.weakTopics} weak
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${subject.completionPercent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
