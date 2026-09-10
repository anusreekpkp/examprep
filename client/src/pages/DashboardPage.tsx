import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useExamProgress, useExams } from '@/hooks/useSyllabus';
import { useDueRevisions } from '@/hooks/useRevisions';
import { formatMinutes } from '@/lib/syllabus';
import { ProgressSummary } from '@/components/ProgressSummary';
import { extractErrorMessage } from '@/lib/api';

const phases = [
  { id: 0, name: 'Foundation', detail: 'Monorepo, TypeScript, Git, Render deploy pipeline', done: true },
  { id: 1, name: 'Auth & data model', detail: '14-model Prisma schema, JWT auth, protected routes', done: true },
  { id: 2, name: 'Exams & syllabus tree', detail: 'Subject → topic hierarchy, templates, manual editing', done: true },
  { id: 3, name: 'Progress tracking', detail: 'Four-state topic status, rollup percentages, dashboard', done: true },
  { id: 4, name: 'Revision engine', detail: 'Spaced repetition with Easy / Moderate / Difficult feedback', done: true },
  { id: 5, name: 'Study timer', detail: 'Focus sessions logged against a specific topic', done: false },
  { id: 6, name: 'Priority engine', detail: '"What should I study next?" scoring across every topic', done: false },
  { id: 7, name: 'Planner, mocks & analytics', detail: 'Daily plans, mock test tracker, weekly reports', done: false },
  { id: 8, name: 'Notes & AI layer', detail: 'Topic notes, AI planner, note and question generation', done: false },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: exams, isPending, isError, error } = useExams();

  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];

  // Only the nearest exam gets a full progress breakdown; the rest stay a list.
  const { data: progress } = useExamProgress(nextExam?.id);
  const { data: due } = useDueRevisions();

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">
        {user?.name ? `Hello, ${user.name}` : 'Dashboard'}
      </h1>

      {isError && (
        <div className="mt-4">
          <Alert>{extractErrorMessage(error, 'Could not load your exams')}</Alert>
        </div>
      )}

      {isPending && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {exams && exams.length === 0 && (
        <Card className="mt-4">
          <h2 className="font-medium">Set up your first exam</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick your exam and its date, and the syllabus arrives ready to work through. SSC CGL,
            UPSC Prelims and Kerala PSC are built in.
          </p>
          <Link to="/exams/new" className="mt-4 inline-block">
            <Button>Add your first exam</Button>
          </Link>
        </Card>
      )}

      {nextExam && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Next exam</p>
              <h2 className="mt-1 text-lg font-medium">{nextExam.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {nextExam.subjectCount} subjects · {nextExam.topicCount} topics
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums text-brand-600">
                {nextExam.daysRemaining}
              </p>
              <p className="text-xs text-slate-500">days remaining</p>
            </div>
          </div>
          <Link to={`/exams/${nextExam.id}`} className="mt-4 inline-block">
            <Button variant="ghost">Open syllabus</Button>
          </Link>
        </Card>
      )}

      {due && due.dueCount > 0 && (
        <Card className="mt-4 border-brand-200 dark:border-brand-700/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Today</p>
              <h2 className="mt-1 text-lg font-medium">
                {due.dueCount} {due.dueCount === 1 ? 'revision is' : 'revisions are'} due
                {due.overdueCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {' '}
                    · {due.overdueCount} overdue
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                About {formatMinutes(due.estimatedMinutes)} ·{' '}
                {due.revisions
                  .slice(0, 3)
                  .map((r) => r.topic.name)
                  .join(', ')}
                {due.dueCount > 3 && ` and ${due.dueCount - 3} more`}
              </p>
            </div>
          </div>
          <Link to="/revisions" className="mt-4 inline-block">
            <Button>Start revising</Button>
          </Link>
        </Card>
      )}

      {progress && progress.overall.totalTopics > 0 && (
        <div className="mt-4">
          <ProgressSummary progress={progress} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Build roadmap
        </h2>
        <ol className="mt-4 space-y-2">
          {phases.map((phase) => (
            <li
              key={phase.id}
              className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  phase.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {phase.done ? '✓' : phase.id}
              </span>
              <div>
                <p className="font-medium">
                  Phase {phase.id} — {phase.name}
                </p>
                <p className="text-sm text-slate-500">{phase.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
