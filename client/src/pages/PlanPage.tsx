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
  planItemStudyHref,
  updatePlanItem,
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
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not build a plan')),
  });

  const setStatus = useMutation({
    mutationFn: (args: { itemId: string; status: PlanItemStatus }) =>
      updatePlanItem(args.itemId, args.status),
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not update that item')),
  });

  const plan = data?.plan ?? null;
  const doneMinutes =
    plan?.items
      .filter((item) => item.status === 'COMPLETED' && item.activity !== 'BREAK')
      .reduce((sum, item) => sum + item.durationMinutes, 0) ?? 0;
  const workMinutes =
    plan?.items
      .filter((item) => item.activity !== 'BREAK')
      .reduce((sum, item) => sum + item.durationMinutes, 0) ?? 0;

  /** The next thing actually left to do, so the plan has one obvious entry point. */
  const nextItem =
    plan?.items.find(
      (item) => item.activity !== 'BREAK' && item.status === 'PENDING' && item.topic,
    ) ?? null;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Today&rsquo;s plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Built from your due revisions first, then your highest-priority topics, with breaks
          every 50 minutes.
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

      {examId && (
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
            <div className="flex items-end">
              <Button onClick={() => generate.mutate()} isLoading={generate.isPending}>
                {plan ? 'Rebuild plan' : 'Build my plan'}
              </Button>
            </div>
          </div>
          {plan && (
            <p className="mt-3 text-xs text-slate-400">
              Rebuilding replaces today&rsquo;s plan, including anything already ticked off.
            </p>
          )}
        </Card>
      )}

      {isPending && examId && <p className="text-sm text-slate-500">Loading…</p>}

      {plan && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">
              {new Date(plan.planDate).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h2>
            <span className="text-sm text-slate-500 tabular-nums">
              {formatMinutes(doneMinutes)} of {formatMinutes(workMinutes)} done
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${workMinutes ? (doneMinutes / workMinutes) * 100 : 0}%` }}
            />
          </div>

          <ol className="mt-4 space-y-2">
            {plan.items.map((item) => {
              const isBreak = item.activity === 'BREAK';
              const done = item.status === 'COMPLETED';
              const skipped = item.status === 'SKIPPED';

              return (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition ${
                    done
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                      : skipped
                        ? 'border-dashed border-slate-200 opacity-60 dark:border-slate-800'
                        : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span className="w-24 shrink-0 text-sm tabular-nums text-slate-500">
                    {minuteToClock(item.startMinuteOfDay)}–
                    {minuteToClock(item.startMinuteOfDay + item.durationMinutes)}
                  </span>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVITY_CLASSES[item.activity]}`}
                  >
                    {ACTIVITY_LABELS[item.activity]}
                  </span>

                  <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'line-through' : ''}`}>
                    {item.topic ? (
                      <>
                        {item.topic.name}
                        <span className="ml-2 text-xs text-slate-400">
                          {item.topic.subject.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">Rest, then carry on</span>
                    )}
                  </span>

                  {!isBreak && (
                    <span className="flex shrink-0 items-center gap-1">
                      {!done && !skipped && item.topic && examId && (
                        <Link to={planItemStudyHref(examId, item)}>
                          <Button className="px-3 py-1 text-xs">Start</Button>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setStatus.mutate({
                            itemId: item.id,
                            status: done ? 'PENDING' : 'COMPLETED',
                          })
                        }
                        className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                      >
                        {done ? 'Undo' : 'Done'}
                      </button>
                      {!done && (
                        <button
                          type="button"
                          onClick={() =>
                            setStatus.mutate({
                              itemId: item.id,
                              status: skipped ? 'PENDING' : 'SKIPPED',
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {skipped ? 'Restore' : 'Skip'}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            {nextItem && examId ? (
              <>
                <Link to={planItemStudyHref(examId, nextItem)}>
                  <Button>Start next: {nextItem.topic?.name}</Button>
                </Link>
                <span className="text-sm text-slate-500">
                  {minuteToClock(nextItem.startMinuteOfDay)} ·{' '}
                  {formatMinutes(nextItem.durationMinutes)} ·{' '}
                  {ACTIVITY_LABELS[nextItem.activity].toLowerCase()}
                </span>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  Everything on today&rsquo;s plan is ticked off or skipped.
                </p>
                <Link to="/timer">
                  <Button variant="ghost">Open the timer</Button>
                </Link>
              </>
            )}
          </div>
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
