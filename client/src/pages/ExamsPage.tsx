import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card } from '@/components/ui';
import { useDeleteExam, useExams } from '@/hooks/useSyllabus';
import { extractErrorMessage } from '@/lib/api';

/** Colours the countdown by urgency so the number reads at a glance. */
function countdownClass(days: number): string {
  if (days < 0) return 'text-slate-500';
  if (days <= 30) return 'text-red-600 dark:text-red-400';
  if (days <= 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export default function ExamsPage() {
  const { data: exams, isPending, isError, error } = useExams();
  const deleteExam = useDeleteExam();

  const handleDelete = (id: string, name: string) => {
    // Deleting an exam takes its whole syllabus and study history with it.
    if (!window.confirm(`Delete "${name}" and its entire syllabus? This cannot be undone.`)) return;
    deleteExam.mutate(id);
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your exams</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each exam carries its own syllabus, progress and revision schedule.
          </p>
        </div>
        <Link to="/exams/new">
          <Button>Add exam</Button>
        </Link>
      </div>

      {isPending && <p className="text-sm text-slate-500">Loading your exams…</p>}

      {isError && <Alert>{extractErrorMessage(error, 'Could not load your exams')}</Alert>}

      {exams && exams.length === 0 && (
        <Card>
          <h2 className="font-medium">No exams yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add your first exam to build a syllabus. Ready-made syllabi are available for SSC CGL,
            UPSC Prelims and Kerala PSC.
          </p>
          <Link to="/exams/new" className="mt-4 inline-block">
            <Button>Add your first exam</Button>
          </Link>
        </Card>
      )}

      <div className="space-y-3">
        {(exams ?? []).map((exam) => (
          <Card key={exam.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  to={`/exams/${exam.id}`}
                  className="text-base font-medium hover:text-brand-600 hover:underline"
                >
                  {exam.name}
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(exam.examDate).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {' · '}
                  {exam.subjectCount} {exam.subjectCount === 1 ? 'subject' : 'subjects'} ·{' '}
                  {exam.topicCount} {exam.topicCount === 1 ? 'topic' : 'topics'}
                </p>
              </div>

              <div className="text-right">
                <p className={`text-2xl font-semibold tabular-nums ${countdownClass(exam.daysRemaining)}`}>
                  {exam.daysRemaining < 0 ? 'Past' : exam.daysRemaining}
                </p>
                <p className="text-xs text-slate-500">
                  {exam.daysRemaining < 0 ? 'exam date passed' : 'days remaining'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Link to={`/exams/${exam.id}`}>
                <Button variant="ghost">Open syllabus</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => handleDelete(exam.id, exam.name)}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
