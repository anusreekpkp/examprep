import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { formatMinutes } from '@/lib/syllabus';
import {
  SESSION_TYPE_LABELS,
  formatClock,
  type Completion,
  type SessionType,
} from '@/lib/sessions';
import {
  useActiveSession,
  useDiscardSession,
  useElapsedSeconds,
  useFinishSession,
  useSessionHistory,
  useStartSession,
} from '@/hooks/useSessions';
import { useExamTree, useExams } from '@/hooks/useSyllabus';

const PRESETS = [25, 50, 90];

export default function TimerPage() {
  const { data: active, isPending } = useActiveSession();
  const { data: exams } = useExams();
  const start = useStartSession();
  const finish = useFinishSession();
  const discard = useDiscardSession();

  /**
   * The priority list and the dashboard link straight into a session with
   * ?topicId=…&examId=…, so "Start" is one click rather than a hunt through a
   * dropdown. examId rides along because the topic dropdown is built from one
   * exam's tree - without it a deep link to a topic in a non-nearest exam would
   * select an id the dropdown cannot show.
   */
  const [searchParams] = useSearchParams();
  const linkedTopicId = searchParams.get('topicId') ?? '';
  const linkedExamId = searchParams.get('examId') ?? undefined;
  const linkedType = searchParams.get('type');

  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  const { data: tree } = useExamTree(linkedExamId ?? nextExam?.id);
  const { data: history } = useSessionHistory();

  const [topicId, setTopicId] = useState(linkedTopicId);
  const [sessionType, setSessionType] = useState<SessionType>(
    linkedType === 'REVISION' ? 'REVISION' : 'NEW_TOPIC',
  );
  const [plannedMinutes, setPlannedMinutes] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  /** Paused and break seconds are local: they only ever reduce the recorded time. */
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [onBreakSince, setOnBreakSince] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [notes, setNotes] = useState('');

  const elapsed = useElapsedSeconds(active?.startedAt);
  const idleNow =
    (pausedAt ? Math.floor((Date.now() - pausedAt) / 1000) : 0) +
    (onBreakSince ? Math.floor((Date.now() - onBreakSince) / 1000) : 0);
  const focused = Math.max(0, elapsed - pausedSeconds - breakSeconds - idleNow);
  const target = (active?.plannedMinutes ?? plannedMinutes) * 60;
  const remaining = target - focused;

  // Put the countdown in the tab title so a backgrounded timer is still visible.
  useEffect(() => {
    if (!active) {
      document.title = 'ExamPrep — Preparation & Revision Manager';
      return;
    }
    const label = remaining >= 0 ? formatClock(remaining) : `+${formatClock(-remaining)}`;
    document.title = `${label} · ${active.topic?.name ?? 'Study'}`;
    return () => {
      document.title = 'ExamPrep — Preparation & Revision Manager';
    };
  }, [active, remaining]);

  const allTopics =
    tree?.subjects.flatMap((subject) =>
      subject.topics.flatMap(function flatten(topic): { id: string; label: string }[] {
        return [
          { id: topic.id, label: `${subject.name} · ${topic.name}` },
          ...topic.children.flatMap(flatten),
        ];
      }),
    ) ?? [];

  const linkedTopicLabel = linkedTopicId
    ? allTopics.find((topic) => topic.id === linkedTopicId)?.label
    : undefined;

  const handleStart = async () => {
    setError(null);
    setSummary(null);
    setPausedSeconds(0);
    setPausedAt(null);
    setBreakSeconds(0);
    setOnBreakSince(null);
    setNotes('');
    try {
      await start.mutateAsync({
        topicId: topicId || null,
        sessionType,
        plannedMinutes,
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not start the session'));
    }
  };

  const togglePause = () => {
    if (pausedAt) {
      setPausedSeconds((total) => total + Math.floor((Date.now() - pausedAt) / 1000));
      setPausedAt(null);
    } else {
      setPausedAt(Date.now());
    }
  };

  const toggleBreak = () => {
    if (onBreakSince) {
      setBreakSeconds((total) => total + Math.floor((Date.now() - onBreakSince) / 1000));
      setOnBreakSince(null);
    } else {
      setOnBreakSince(Date.now());
    }
  };

  const handleFinish = async (completion?: Completion) => {
    if (!active) return;
    setError(null);
    const pending = pausedAt ? Math.floor((Date.now() - pausedAt) / 1000) : 0;
    const breakPending = onBreakSince ? Math.floor((Date.now() - onBreakSince) / 1000) : 0;

    try {
      const result = await finish.mutateAsync({
        sessionId: active.id,
        focusedSeconds: Math.max(0, elapsed - pausedSeconds - pending - breakSeconds - breakPending),
        breakSeconds: breakSeconds + breakPending,
        ...(completion ? { completion } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      const parts = [`Recorded ${formatMinutes(result.minutesRecorded)}`];
      if (result.topicStatus === 'COMPLETED_REVISION_DUE') {
        parts.push(`marked complete · ${result.seededRevisions} revisions scheduled`);
      } else if (result.topicStatus === 'LEARNING') {
        parts.push('marked as learning');
      }
      setSummary(`${parts.join(' · ')}.`);
      setIsFinishing(false);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not finish the session'));
    }
  };

  const handleDiscard = async () => {
    if (!active) return;
    if (!window.confirm('Discard this session? Nothing will be recorded.')) return;
    setError(null);
    try {
      await discard.mutateAsync(active.id);
      setSummary(null);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not discard the session'));
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Study timer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time is logged against a topic, so it feeds your progress and, if you finish the topic,
          schedules its revisions.
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {summary && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {summary}
        </p>
      )}

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {/* ------------------------------------------------------ running --- */}
      {active && (
        <Card>
          <div className="text-center">
            <p className="text-sm text-slate-500">
              {active.topic ? (
                <>
                  {active.topic.subject.name} · <strong>{active.topic.name}</strong>
                </>
              ) : (
                'General study session'
              )}
            </p>

            <p
              className={`mt-2 font-semibold tabular-nums ${
                remaining < 0 ? 'text-emerald-600' : 'text-brand-600'
              } text-6xl`}
            >
              {remaining >= 0 ? formatClock(remaining) : `+${formatClock(-remaining)}`}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {remaining >= 0
                ? `of ${active.plannedMinutes} minutes · ${formatClock(focused)} focused`
                : `past your ${active.plannedMinutes} minute target · ${formatClock(focused)} focused`}
            </p>

            {pausedAt && (
              <p className="mt-2 text-sm font-medium text-amber-600">Paused — not counting</p>
            )}
            {onBreakSince && (
              <p className="mt-2 text-sm font-medium text-amber-600">On a break — not counting</p>
            )}

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${Math.min(100, (focused / Math.max(1, target)) * 100)}%` }}
              />
            </div>
          </div>

          {!isFinishing ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="ghost" onClick={togglePause} disabled={Boolean(onBreakSince)}>
                {pausedAt ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="ghost" onClick={toggleBreak} disabled={Boolean(pausedAt)}>
                {onBreakSince ? 'End break' : 'Take a break'}
              </Button>
              <Button onClick={() => setIsFinishing(true)}>Finish session</Button>
              <Button
                variant="ghost"
                onClick={() => void handleDiscard()}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Discard
              </Button>
            </div>
          ) : (
            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              {active.topic ? (
                <>
                  <p className="text-sm font-medium">Did you complete this topic?</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Answering Yes marks it complete and schedules its five revisions.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium">Finish this session?</p>
              )}

              <Field label="Notes (optional)" htmlFor="notes">
                <Input
                  id="notes"
                  value={notes}
                  placeholder="What did you cover?"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>

              <div className="mt-3 flex flex-wrap gap-2">
                {active.topic ? (
                  <>
                    <Button onClick={() => void handleFinish('YES')} isLoading={finish.isPending}>
                      Yes, finished
                    </Button>
                    <Button variant="ghost" onClick={() => void handleFinish('PARTIAL')}>
                      Partially
                    </Button>
                    <Button variant="ghost" onClick={() => void handleFinish('NO')}>
                      Not yet
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => void handleFinish()} isLoading={finish.isPending}>
                    Save session
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setIsFinishing(false)}>
                  Keep going
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* -------------------------------------------------------- setup --- */}
      {!active && !isPending && (
        <Card>
          <h2 className="font-medium">Start a session</h2>

          {linkedTopicLabel && (
            <p className="mt-1 text-sm text-slate-500">
              Ready to work on <strong className="text-slate-700 dark:text-slate-200">{linkedTopicLabel}</strong>
              . Pick a length and go.
            </p>
          )}

          {allTopics.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              You have no topics yet.{' '}
              <Link to="/exams" className="text-brand-600 hover:underline">
                Build a syllabus first
              </Link>{' '}
              — or start a general session below.
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Topic" htmlFor="topic" hint="Leave blank for general study.">
              <select
                id="topic"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">No specific topic</option>
                {allTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Session type" htmlFor="sessionType">
              <select
                id="sessionType"
                value={sessionType}
                onChange={(event) => setSessionType(event.target.value as SessionType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-950"
              >
                {Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium">Length</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPlannedMinutes(preset)}
                  aria-pressed={plannedMinutes === preset}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    plannedMinutes === preset
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {preset} min
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={240}
                value={plannedMinutes}
                aria-label="Custom length in minutes"
                onChange={(event) => setPlannedMinutes(Number(event.target.value) || 1)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          <Button className="mt-5" onClick={() => void handleStart()} isLoading={start.isPending}>
            Start studying
          </Button>
        </Card>
      )}

      {/* ------------------------------------------------------ history --- */}
      {history && history.count > 0 && (
        <Card className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Recent sessions</h2>
            <span className="text-sm text-slate-500">
              {formatMinutes(history.totalMinutes)} logged
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {history.sessions.slice(0, 8).map((session) => (
              <li key={session.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {session.topic?.name ?? 'General study'}
                  <span className="ml-2 text-xs text-slate-400">
                    {SESSION_TYPE_LABELS[session.sessionType]}
                    {session.completion === 'YES' && ' · completed'}
                    {session.completion === 'PARTIAL' && ' · partial'}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {formatClock(session.durationSeconds)} ·{' '}
                  {new Date(session.startedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
