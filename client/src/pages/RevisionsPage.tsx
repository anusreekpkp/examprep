import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Card } from '@/components/ui';
import { RevisionCard } from '@/components/RevisionCard';
import { extractErrorMessage } from '@/lib/api';
import { formatMinutes, type Difficulty } from '@/lib/syllabus';
import { useCompleteRevision, useDueRevisions, useSkipRevision, useUpcomingRevisions } from '@/hooks/useRevisions';
import { useExams } from '@/hooks/useSyllabus';

export default function RevisionsPage() {
  const { data, isPending, isError, error } = useDueRevisions();
  const { data: exams } = useExams();
  const complete = useCompleteRevision();
  const skip = useSkipRevision();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Kept after the card disappears, so the student sees why it moved. */
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  const { data: upcoming } = useUpcomingRevisions(nextExam?.id, 14);

  const handleRate = async (revisionId: string, feedback: Difficulty) => {
    setActionError(null);
    setBusyId(revisionId);
    try {
      const result = await complete.mutateAsync({ revisionId, feedback });
      setLastMessage(`${result.topic.name}: ${result.message}`);
    } catch (err) {
      setActionError(extractErrorMessage(err, 'Could not record that revision'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (revisionId: string, topicName: string) => {
    setActionError(null);
    setBusyId(revisionId);
    try {
      await skip.mutateAsync(revisionId);
      setLastMessage(`${topicName}: moved to tomorrow.`);
    } catch (err) {
      setActionError(extractErrorMessage(err, 'Could not skip that revision'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Today&rsquo;s revisions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each topic comes back on a widening schedule — 1, 3, 7, 15 then 30 days. How you rate a
          revision changes when it returns.
        </p>
      </div>

      {isError && <Alert>{extractErrorMessage(error, 'Could not load your revisions')}</Alert>}
      {isPending && <p className="text-sm text-slate-500">Loading…</p>}

      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      {lastMessage && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {lastMessage}
        </p>
      )}

      {data && data.dueCount > 0 && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {data.dueCount} {data.dueCount === 1 ? 'revision' : 'revisions'} due
                {data.overdueCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {' '}
                    · {data.overdueCount} overdue
                  </span>
                )}
              </span>
              <span className="text-sm text-slate-500">
                about {formatMinutes(data.estimatedMinutes)}
              </span>
            </div>
          </Card>

          <div className="space-y-3">
            {data.revisions.map((revision) => (
              <RevisionCard
                key={revision.id}
                revision={revision}
                isBusy={busyId === revision.id}
                onRate={(feedback) => void handleRate(revision.id, feedback)}
                onSkip={() => void handleSkip(revision.id, revision.topic.name)}
              />
            ))}
          </div>
        </>
      )}

      {data && data.dueCount === 0 && (
        <Card>
          <h2 className="font-medium">Nothing due today</h2>
          <p className="mt-1 text-sm text-slate-500">
            Revisions appear here once you mark a topic{' '}
            <span className="font-medium">Revision due</span> in your syllabus. The first one
            lands the next day.
          </p>
          <Link to="/exams" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
            Open a syllabus →
          </Link>
        </Card>
      )}

      {upcoming && upcoming.days.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-medium">Coming up</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {upcoming.days.slice(0, 7).map((day) => (
              <li key={day.date} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-500">
                  {day.inDays === 1 ? 'Tomorrow' : `In ${day.inDays} days`}
                  <span className="ml-2 text-xs text-slate-400">{day.date}</span>
                </span>
                <span className="tabular-nums">
                  {day.count} {day.count === 1 ? 'topic' : 'topics'} ·{' '}
                  {formatMinutes(day.estimatedMinutes)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
