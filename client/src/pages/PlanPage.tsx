import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { formatMinutes } from '@/lib/syllabus';
import { useExams } from '@/hooks/useSyllabus';
import {
  ACTIVITY_CLASSES,
  ACTIVITY_LABELS,
  fetchPlan,
  generatePlan,
  minuteToClock,
  planBreakdown,
  planItemStudyHref,
  updatePlanItem,
  type PlanItem,
  type PlanItemStatus,
} from '@/lib/plans';

export default function PlanPage() {
  const queryClient = useQueryClient();
  const { data: exams } = useExams();
  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  const examId = nextExam?.id;

  const [hours, setHours] = useState(4);
  const [startTime, setStartTime] = useState('08:00');
  const [editingAvailability, setEditingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['plan', examId],
    queryFn: () => fetchPlan(examId as string),
    enabled: Boolean(examId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['plan'] });

  const generate = useMutation({
    mutationFn: () => {
      const [h = '8', m = '0'] = startTime.split(':');
      return generatePlan(examId as string, {
        availableMinutes: Math.round(hours * 60),
        startMinuteOfDay: Number(h) * 60 + Number(m),
      });
    },
    onSuccess: () => {
      setEditingAvailability(false);
      void invalidate();
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not build a plan')),
  });

  const setStatus = useMutation({
    mutationFn: (args: { itemId: string; status: PlanItemStatus }) =>
      updatePlanItem(args.itemId, args.status),
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not update that item')),
  });

  const plan = data?.plan ?? null;
  const breakdown = plan ? planBreakdown(plan) : null;
  const availableMinutes = Math.round(hours * 60);

  const doneMinutes =
    plan?.items
      .filter((item) => item.status === 'COMPLETED' && item.activity !== 'BREAK')
      .reduce((sum, item) => sum + item.durationMinutes, 0) ?? 0;

  const nextItem =
    plan?.items.find(
      (item) => item.activity !== 'BREAK' && item.status === 'PENDING' && item.topic,
    ) ?? null;

  /** Distinct reasons, in schedule order - the "why these topics" summary. */
  const reasonRows = (plan?.items ?? []).filter(
    (item) => item.activity !== 'BREAK' && item.topic && item.reason,
  );

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Today&rsquo;s plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          {plan
            ? `${new Date(plan.planDate).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })} · built from your due revisions first, then the topics that need you most.`
            : 'Tell it how long you have and it will lay out the day for you.'}
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!examId && (
        <Card>
          <p className="text-sm text-slate-500">
            Add an exam first —{' '}
            <Link to="/exams/new" className="text-brand-600 hover:underline">
              create one here
            </Link>
            .
          </p>
        </Card>
      )}

      {isPending && examId && <p className="text-sm text-slate-500">Loading…</p>}

      {/* ----------------------------------------------- availability --- */}
      {examId && (!plan || editingAvailability) && (
        <Card className="mb-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Hours available today" htmlFor="hours">
              <Input
                id="hours"
                type="number"
                min={0.5}
                max={16}
                step={0.5}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value) || 1)}
              />
            </Field>
            <Field label="Start at" htmlFor="startTime">
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button onClick={() => generate.mutate()} isLoading={generate.isPending}>
                {plan ? 'Rebuild plan' : 'Build my plan'}
              </Button>
              {plan && (
                <Button variant="ghost" onClick={() => setEditingAvailability(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
          {plan && (
            <p className="mt-3 text-xs text-slate-400">
              Rebuilding replaces today&rsquo;s plan, including anything already ticked off.
            </p>
          )}
        </Card>
      )}

      {/* --------------------------------------------------- summary --- */}
      {plan && breakdown && !editingAvailability && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Today&rsquo;s plan
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMinutes(breakdown.studyMinutes)} of study
              </p>
              <p className="text-sm text-slate-500">
                {formatMinutes(breakdown.totalMinutes)} scheduled including breaks
                {availableMinutes > breakdown.totalMinutes &&
                  ` · ${formatMinutes(availableMinutes - breakdown.totalMinutes)} spare`}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setEditingAvailability(true)}>
              Edit availability
            </Button>
          </div>

          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {breakdown.totals.map(([activity, minutes]) => (
              <div
                key={activity}
                className="flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
              >
                <dt className="text-slate-500">{ACTIVITY_LABELS[activity]}</dt>
                <dd className="font-medium tabular-nums">{formatMinutes(minutes)}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-500">Progress</span>
              <span className="tabular-nums">
                {formatMinutes(doneMinutes)} of {formatMinutes(breakdown.studyMinutes)} done
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${breakdown.studyMinutes ? (doneMinutes / breakdown.studyMinutes) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {nextItem && examId && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Link to={planItemStudyHref(examId, nextItem)}>
                <Button>▶ Start {nextItem.topic?.name}</Button>
              </Link>
              <span className="text-sm text-slate-500">
                {minuteToClock(nextItem.startMinuteOfDay)} ·{' '}
                {formatMinutes(nextItem.durationMinutes)}
                {nextItem.reason && ` · ${nextItem.reason}`}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* --------------------------------------- why these topics --- */}
      {plan && reasonRows.length > 0 && !editingAvailability && (
        <Card className="mb-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Why these topics?
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {reasonRows.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{item.topic?.name}</span>
                <span className="text-slate-400">—</span>
                <span className="text-slate-600 dark:text-slate-300">{item.reason}</span>
              </li>
            ))}
          </ul>

          {/*
            The honest part. A syllabus says what is examinable, not how the
            marks are split, so unless the student supplied weightage the
            engine must not imply it knows which subjects score highest.
          */}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800">
            {data?.hasWeightageData ? (
              <>
                Ranked using the subject weightage you entered for this exam, plus your progress,
                the topics you marked difficult, mock accuracy and revisions that have fallen due.
              </>
            ) : (
              <>
                This exam has no subject weightage recorded, so the plan does not claim to know
                which subjects carry the most marks. It ranks on what it can actually see — what
                you have covered, what you marked difficult, your mock accuracy, revisions that
                have fallen due and the days left — and spreads equally-ranked topics across your
                subjects.{' '}
                <Link to={`/exams/${examId}`} className="text-brand-600 hover:underline">
                  Add weightage
                </Link>{' '}
                if your exam publishes it, and the plan will use it.
              </>
            )}
          </p>
        </Card>
      )}

      {/* -------------------------------------------------- schedule --- */}
      {plan && !editingAvailability && (
        <Card>
          <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Today&rsquo;s schedule
          </h2>

          <ol className="mt-3">
            {plan.items.map((item) =>
              item.activity === 'BREAK' ? (
                <BreakRow key={item.id} item={item} />
              ) : (
                <StudyRow
                  key={item.id}
                  item={item}
                  examId={examId as string}
                  onStatus={(status) => setStatus.mutate({ itemId: item.id, status })}
                />
              ),
            )}
          </ol>

          {!nextItem && (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-800">
              Everything on today&rsquo;s plan is ticked off or skipped.{' '}
              <Link to="/priorities" className="text-brand-600 hover:underline">
                See what else is ranked
              </Link>
              .
            </p>
          )}
        </Card>
      )}

      {examId && !plan && !isPending && (
        <Card>
          <h2 className="font-medium">No plan for today yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tell it how long you have and it will lay out the day for you.
          </p>
        </Card>
      )}
    </AppShell>
  );
}

/* -------------------------------------------------------------- pieces --- */

/** Breaks are scaffolding, not tasks, so they read as a divider. */
function BreakRow({ item }: { item: PlanItem }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2 text-xs text-slate-400">
      <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
      <span className="shrink-0 tabular-nums">
        ☕ {item.durationMinutes} min break · {minuteToClock(item.startMinuteOfDay)}
      </span>
      <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
    </li>
  );
}

function StudyRow({
  item,
  examId,
  onStatus,
}: {
  item: PlanItem;
  examId: string;
  onStatus: (status: PlanItemStatus) => void;
}) {
  const done = item.status === 'COMPLETED';
  const skipped = item.status === 'SKIPPED';

  return (
    <li
      className={`mb-2 rounded-lg border p-3 transition ${
        done
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
          : skipped
            ? 'border-dashed border-slate-200 opacity-60 dark:border-slate-800'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-24 shrink-0 text-sm tabular-nums text-slate-500">
          {minuteToClock(item.startMinuteOfDay)}–
          {minuteToClock(item.startMinuteOfDay + item.durationMinutes)}
        </span>

        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVITY_CLASSES[item.activity]}`}
            >
              {ACTIVITY_LABELS[item.activity]}
            </span>
            <span className={`min-w-0 font-medium ${done ? 'line-through' : ''}`}>
              {item.topic?.name ?? 'Study'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {item.topic?.subject.name}
            {' · '}
            {formatMinutes(item.durationMinutes)}
            {item.reason && (
              <>
                {' · '}
                <span className="text-slate-600 dark:text-slate-300">{item.reason}</span>
              </>
            )}
          </p>
        </div>

        {/*
          Only Start shows on an untouched slot. Done and Skip appear once the
          slot is finished or beside it as quiet text - offering "Done" before
          any work has happened invites ticking the plan off without doing it.
        */}
        <span className="flex shrink-0 items-center gap-1">
          {!done && !skipped && item.topic && (
            <Link to={planItemStudyHref(examId, item)}>
              <Button className="px-3 py-1 text-xs">Start</Button>
            </Link>
          )}
          {done ? (
            <button
              type="button"
              onClick={() => onStatus('PENDING')}
              className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Undo
            </button>
          ) : skipped ? (
            <button
              type="button"
              onClick={() => onStatus('PENDING')}
              className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStatus('COMPLETED')}
                title="Mark done without using the timer"
                className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => onStatus('SKIPPED')}
                className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Skip
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  );
}
