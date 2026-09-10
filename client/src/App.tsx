import { ConnectionStatus } from '@/components/ConnectionStatus';

const phases = [
  { id: 0, name: 'Foundation', detail: 'Monorepo, TypeScript, Git, Render deploy pipeline', done: true },
  { id: 1, name: 'Auth & data model', detail: 'Prisma schema, JWT auth, protected routes', done: false },
  { id: 2, name: 'Exams & syllabus tree', detail: 'Subject → topic hierarchy, templates, manual editing', done: false },
  { id: 3, name: 'Progress tracking', detail: 'Four-state topic status, rollup percentages, dashboard', done: false },
  { id: 4, name: 'Revision engine', detail: 'Spaced repetition with Easy / Moderate / Difficult feedback', done: false },
  { id: 5, name: 'Study timer', detail: 'Focus sessions logged against a specific topic', done: false },
  { id: 6, name: 'Priority engine', detail: '"What should I study next?" scoring across every topic', done: false },
  { id: 7, name: 'Planner, mocks & analytics', detail: 'Daily plans, mock test tracker, weekly reports', done: false },
  { id: 8, name: 'Notes & AI layer', detail: 'Topic notes, AI planner, note and question generation', done: false },
];

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">ExamPrep</h1>
            <p className="text-sm text-slate-500">Preparation &amp; Revision Management System</p>
          </div>
          <ConnectionStatus />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Build roadmap</h2>
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
      </main>
    </div>
  );
}
