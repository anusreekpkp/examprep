import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card } from '@/components/ui';
import { useDashboard } from '@/hooks/useDashboard';
import { extractErrorMessage } from '@/lib/api';
import { greeting, relativeTime, type DashboardDay } from '@/lib/dashboard';
import { priorityBand, studyHref, type RankedTopic } from '@/lib/priorities';
import { STATUS_CLASSES, STATUS_SHORT, formatMinutes } from '@/lib/syllabus';

export default function DashboardPage() {
  const { data, isPending, isError, error } = useDashboard();

  if (isPending) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading your day…</p>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <Alert>{extractErrorMessage(error, 'Could not load your dashboard')}</Alert>
      </AppShell>
    );
  }

  const { exam, todayStats, weekStats, streak, continueWith, priorities, pace } = data;

  if (!exam) {
    return (
      <AppShell>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {data.name}
        </h1>
        <Card className="mt-6 max-w-2xl">
          <h2 className="font-medium">Set up your first exam</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick your exam and its date, and the syllabus arrives ready to work through. SSC CGL,
            UPSC Prelims and Kerala PSC are built in.
          </p>
          <Link to="/exams/new" className="mt-4 inline-block">
            <Button>Add your first exam</Button>
          </Link>
        </Card>
      </AppShell>
    );
  }

  // examId rides along so the timer's topic picker is built from the right exam.
  const resumeHref = continueWith
    ? `/timer?topicId=${continueWith.topicId}&examId=${continueWith.examId}`
    : priorities[0]
      ? `/timer?topicId=${priorities[0].topic.id}&examId=${priorities[0].topic.examId}`
      : '/timer';

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {data.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {todayStats.revisionsDue > 0
            ? `${todayStats.revisionsDue} revision${
                todayStats.revisionsDue === 1 ? '' : 's'
              } due — here is what to focus on today.`
            : 'Here is what to focus on today.'}
        </p>
      </header>

      {/* -------------------------------------------------- at a glance --- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Today's plan"
          value={
            todayStats.hasPlan
              ? `${todayStats.plannedTasks} ${todayStats.plannedTasks === 1 ? 'task' : 'tasks'}`
              : 'Not built'
          }
          hint={
            todayStats.hasPlan
              ? `${formatMinutes(todayStats.plannedRemainingMinutes)} left to do`
              : 'Generate one in a click'
          }
          to="/plan"
        />
        <StatTile
          label="Studied today"
          value={formatMinutes(todayStats.studiedMinutes)}
          hint={
            todayStats.targetMinutes > 0
              ? `of ${formatMinutes(todayStats.targetMinutes)} target`
              : undefined
          }
          delta={todayStats.versusYesterdayMinutes}
          to="/analytics"
        />
        <StatTile
          label="Revisions due"
          value={String(todayStats.revisionsDue)}
          hint={todayStats.revisionsDue > 0 ? 'Clear these first' : 'Nothing outstanding'}
          emphasis={todayStats.revisionsDue > 0}
          to="/revisions"
        />
        <StreakTile current={streak.current} week={streak.week} />
      </div>

      {/* --------------------------------------- exam / week / continue --- */}
      {/* items-start: without it the shorter column stretches to match the
          taller one, which is where the old dashboard's empty space came from. */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Next exam
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{exam.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {new Date(exam.examDate).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {' · '}
                {exam.subjectCount} subjects · {exam.topicCount} topics
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-4xl font-semibold leading-none tabular-nums ${
                  exam.daysRemaining <= 30
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-brand-600 dark:text-brand-300'
                }`}
              >
                {exam.daysRemaining}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                days left
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-500">Syllabus covered</span>
              <span className="font-medium tabular-nums">{exam.completionPercent}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${exam.completionPercent}%` }}
              />
            </div>

            {/* The arithmetic a student rarely does for themselves: whether
                what is left actually fits in the days that remain. */}
            {pace && pace.minutesNeededPerDay !== null && (
              <p
                className={`mt-2 text-sm ${
                  pace.onTrack ? 'text-slate-500' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatMinutes(pace.estimatedMinutesRemaining)} of study left ·{' '}
                {pace.onTrack ? (
                  <>
                    {formatMinutes(pace.minutesNeededPerDay)}/day needed, and you have{' '}
                    {formatMinutes(pace.dailyAvailableMinutes)} — on track
                  </>
                ) : (
                  <>
                    needs {formatMinutes(pace.minutesNeededPerDay)}/day but you have{' '}
                    {formatMinutes(pace.dailyAvailableMinutes)} — trim the syllabus or add time
                  </>
                )}
              </p>
            )}
          </div>

          {exam.subjects.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Coverage by subject
              </p>
              <ul className="mt-2.5 space-y-2">
                {exam.subjects.map((subject) => (
                  <li key={subject.id} className="flex items-center gap-3 text-sm">
                    <Link
                      to={`/exams/${exam.id}`}
                      className="min-w-0 flex-1 truncate hover:text-brand-600"
                      title={
                        subject.weightage === null
                          ? `${subject.name} · no published weightage`
                          : `${subject.name} · ${subject.weightage}% of the paper`
                      }
                    >
                      {subject.name}
                    </Link>
                    <span className="w-28 shrink-0 sm:w-40">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <span
                          className={`block h-full rounded-full ${
                            subject.completionPercent >= 60
                              ? 'bg-emerald-500'
                              : subject.completionPercent > 0
                                ? 'bg-amber-500'
                                : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          style={{ width: `${Math.max(subject.completionPercent, 1)}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">
                      {subject.completionPercent}%
                    </span>
                    {subject.weightage !== null && (
                      <span className="hidden w-16 shrink-0 text-right text-xs text-slate-400 sm:block">
                        {subject.weightage}% wt
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={resumeHref}>
              <Button>{continueWith ? 'Continue studying' : 'Start studying'}</Button>
            </Link>
            <Link to={`/exams/${exam.id}`}>
              <Button variant="ghost">View syllabus</Button>
            </Link>
          </div>
        </Card>

        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">This week</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatMinutes(weekStats.minutes)}
            </p>
            {weekStats.targetMinutes > 0 && (
              <>
                <p className="text-xs text-slate-500">
                  of {formatMinutes(weekStats.targetMinutes)} target
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, weekStats.percent)}%` }}
                  />
                </div>
              </>
            )}
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Sessions" value={String(weekStats.sessions)} />
              <Row label="Topics finished" value={String(weekStats.topicsCompleted)} />
              <Row label="Revisions done" value={String(weekStats.revisionsDone)} />
            </dl>
            <Link
              to="/analytics"
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Full analytics →
            </Link>
          </Card>

          {continueWith && (
            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Pick up where you left off
              </p>
              <p className="mt-1 font-medium">{continueWith.topicName}</p>
              <p className="text-sm text-slate-500">
                {continueWith.subjectName} · {relativeTime(continueWith.lastStudiedAt)}
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  STATUS_CLASSES[continueWith.status]
                }`}
              >
                {STATUS_SHORT[continueWith.status]}
              </span>
              <Link to={resumeHref} className="mt-3 block">
                <Button variant="ghost">Resume session</Button>
              </Link>
            </Card>
          )}
        </div>
      </div>

      {/* --------------------------------------------- the centrepiece --- */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">What to study next</h2>
            <p className="text-sm text-slate-500">
              Ranked by exam weight, how much is left, your performance and what is due for
              revision.
            </p>
          </div>
          <Link to="/priorities" className="text-sm font-medium text-brand-600 hover:underline">
            See all ranked →
          </Link>
        </div>

        {priorities.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              Nothing to rank yet — add topics to your syllabus and they will be scored here.
            </p>
          </Card>
        ) : (
          <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {priorities.map((entry, index) => (
              <PriorityItem key={entry.topic.id} entry={entry} rank={index + 1} />
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  );
}

/* ------------------------------------------------------------- pieces --- */

function StatTile({
  label,
  value,
  hint,
  delta,
  emphasis,
  to,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  delta?: number;
  emphasis?: boolean;
  to: string;
}) {
  return (
    <Link
      to={to}
      className={`rounded-xl border p-4 transition hover:border-brand-300 dark:hover:border-brand-700 ${
        emphasis
          ? 'border-orange-200 bg-orange-50/70 dark:border-orange-900/60 dark:bg-orange-950/20'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">
        {hint}
        {/* Only rendered when there is a real difference to report. */}
        {delta !== undefined && delta !== 0 && (
          <span className={delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
            {hint ? ' · ' : ''}
            {delta > 0 ? '+' : '−'}
            {formatMinutes(Math.abs(delta))} vs yesterday
          </span>
        )}
      </p>
    </Link>
  );
}

function StreakTile({ current, week }: { current: number; week: DashboardDay[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Study streak</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {current > 0 && <span aria-hidden="true">🔥 </span>}
        {current} {current === 1 ? 'day' : 'days'}
      </p>
      <div className="mt-2 flex gap-1.5">
        {week.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
            <span
              title={`${day.weekday}: ${day.minutes} min`}
              className={`h-5 w-full rounded ${
                day.minutes > 0
                  ? 'bg-emerald-500'
                  : day.isToday
                    ? 'bg-slate-300 dark:bg-slate-600'
                    : 'bg-slate-100 dark:bg-slate-800'
              }`}
            />
            <span
              className={`text-[10px] ${
                day.isToday
                  ? 'font-semibold text-slate-600 dark:text-slate-300'
                  : 'text-slate-400'
              }`}
            >
              {day.weekday.charAt(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PriorityItem({ entry, rank }: { entry: RankedTopic; rank: number }) {
  const { topic, reasons, score } = entry;
  const isRevision = topic.daysOverdue !== null;
  const band = priorityBand(score, entry.maxScore);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-slate-300 dark:text-slate-600">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {topic.isStarred && (
            <span className="text-amber-500" aria-label="Starred">
              ★
            </span>
          )}
          <span className="min-w-0 truncate">{topic.name}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              STATUS_CLASSES[topic.status]
            }`}
          >
            {STATUS_SHORT[topic.status]}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${band.className}`}>
            {band.label}
          </span>
          {/* The reasons ARE the explanation of the score, so they carry the row. */}
          <span className="text-slate-500">{reasons.join(' · ')}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {topic.subjectName} · about {formatMinutes(topic.estimatedMinutes)} · score{' '}
          {Math.round(score)}/{entry.maxScore}
        </p>
      </div>

      <Link to={studyHref(topic)} className="shrink-0">
        <Button>{isRevision ? 'Revise now' : 'Start'}</Button>
      </Link>
    </li>
  );
}
