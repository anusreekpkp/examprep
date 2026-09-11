import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Alert, Card } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { formatMinutes } from '@/lib/syllabus';
import { INSIGHT_CLASSES, fetchSummary } from '@/lib/analytics';
import { accuracyClass } from '@/lib/mocks';

const RANGES = [7, 14, 30];

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => fetchSummary(days),
  });

  const peak = Math.max(1, ...(data?.byDay.map((day) => day.minutes) ?? [1]));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Study analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Where your time actually went, and what it bought you.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              aria-pressed={days === range}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                days === range
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {isError && <Alert>{extractErrorMessage(error, 'Could not load your analytics')}</Alert>}
      {isPending && <p className="text-sm text-slate-500">Crunching your sessions…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total study" value={formatMinutes(data.totalMinutes)} />
            <Stat label="Daily average" value={formatMinutes(data.averageDailyMinutes)} />
            <Stat
              label="Most productive"
              value={data.mostProductiveDay ? data.mostProductiveDay.weekday : '—'}
              hint={
                data.mostProductiveDay ? formatMinutes(data.mostProductiveDay.minutes) : undefined
              }
            />
            <Stat
              label="Current streak"
              value={`${data.currentStreak} ${data.currentStreak === 1 ? 'day' : 'days'}`}
              hint={`studied ${data.studiedDays} of ${data.days}`}
            />
          </div>

          {data.insights.length > 0 && (
            <div className="mt-4 space-y-2">
              {data.insights.map((insight) => (
                <p
                  key={insight.message}
                  className={`rounded-lg px-3 py-2 text-sm ${INSIGHT_CLASSES[insight.tone]}`}
                >
                  {insight.message}
                </p>
              ))}
            </div>
          )}

          <Card className="mt-4">
            <h2 className="text-sm font-medium">Minutes per day</h2>
            {/* A column chart made of divs: no chart library needed for one bar row. */}
            <div className="mt-4 flex h-40 items-end gap-2">
              {data.byDay.map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs tabular-nums text-slate-400">
                    {day.minutes > 0 ? day.minutes : ''}
                  </span>
                  <div
                    className={`w-full rounded-t ${day.minutes > 0 ? 'bg-brand-500' : 'bg-slate-100 dark:bg-slate-800'}`}
                    style={{ height: `${Math.max(2, (day.minutes / peak) * 100)}%` }}
                    title={`${day.weekday}: ${day.minutes} minutes`}
                  />
                  <span className="text-xs text-slate-500">{day.weekday.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-4">
            <h2 className="text-sm font-medium">Time against results</h2>
            <p className="mt-1 text-xs text-slate-500">
              Hours in one column, mock accuracy in the other. A big gap between them is where
              your study method needs changing, not your effort.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2">Subject</th>
                    <th className="pb-2 text-right">Time</th>
                    <th className="pb-2 text-right">Mock accuracy</th>
                    <th className="pb-2 text-right">Topics done</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySubject.map((subject) => (
                    <tr key={subject.subjectId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">{subject.subjectName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {subject.minutes > 0 ? formatMinutes(subject.minutes) : '—'}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${accuracyClass(subject.accuracy)}`}>
                        {subject.accuracy !== null ? `${Math.round(subject.accuracy)}%` : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {subject.topicsCompleted}/{subject.topicsTotal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}
