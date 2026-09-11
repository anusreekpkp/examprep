import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { extractErrorMessage } from '@/lib/api';
import { useExamTree, useExams } from '@/hooks/useSyllabus';
import {
  accuracyClass,
  createMock,
  deleteMock,
  fetchMockAnalysis,
  fetchMocks,
  type NewMockSection,
} from '@/lib/mocks';

interface SectionDraft {
  subjectId: string;
  name: string;
  attempted: string;
  correct: string;
  marks: string;
  maxMarks: string;
}

export default function MockTestsPage() {
  const queryClient = useQueryClient();
  const { data: exams } = useExams();
  const nextExam = exams
    ?.filter((exam) => exam.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  const examId = nextExam?.id;

  const { data: tree } = useExamTree(examId);
  const { data: mocks } = useQuery({
    queryKey: ['mocks', examId],
    queryFn: () => fetchMocks(examId as string),
    enabled: Boolean(examId),
  });
  const { data: analysis } = useQuery({
    queryKey: ['mocks', examId, 'analysis'],
    queryFn: () => fetchMockAnalysis(examId as string),
    enabled: Boolean(examId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [sections, setSections] = useState<SectionDraft[]>([]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mocks'] }),
      // Mock accuracy feeds the weakness component, so the ranking changes too.
      queryClient.invalidateQueries({ queryKey: ['priorities'] }),
    ]);
  };

  const save = useMutation({
    mutationFn: (payload: { name: string; takenAt: string; sections: NewMockSection[] }) =>
      createMock(examId as string, payload),
    onSuccess: async () => {
      await invalidate();
      setIsAdding(false);
      setName('');
      setSections([]);
    },
    onError: (err) => setError(extractErrorMessage(err, 'Could not save that mock test')),
  });

  const remove = useMutation({
    mutationFn: deleteMock,
    onSuccess: invalidate,
    onError: (err) => setError(extractErrorMessage(err, 'Could not delete that mock test')),
  });

  const beginAdding = () => {
    setError(null);
    // Pre-fill one row per subject; that is what a real mark sheet looks like.
    setSections(
      (tree?.subjects ?? []).map((subject) => ({
        subjectId: subject.id,
        name: subject.name,
        attempted: '',
        correct: '',
        marks: '',
        maxMarks: '',
      })),
    );
    setName(`Mock Test #${(mocks?.length ?? 0) + 1}`);
    setIsAdding(true);
  };

  const handleSave = () => {
    setError(null);
    const parsed: NewMockSection[] = sections
      .filter((row) => row.attempted.trim() || row.correct.trim() || row.marks.trim())
      .map((row) => ({
        subjectId: row.subjectId || null,
        name: row.name,
        attempted: Number(row.attempted) || 0,
        correct: Number(row.correct) || 0,
        marks: Number(row.marks) || 0,
        maxMarks: Number(row.maxMarks) || 0,
      }));

    if (parsed.length === 0) {
      setError('Fill in at least one section.');
      return;
    }
    save.mutate({ name: name.trim() || 'Mock test', takenAt, sections: parsed });
  };

  const updateRow = (index: number, patch: Partial<SectionDraft>) =>
    setSections((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mock tests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Record each attempt section by section. Accuracy per subject feeds straight into what
            you are told to study next.
          </p>
        </div>
        {examId && !isAdding && <Button onClick={beginAdding}>Add a mock test</Button>}
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

      {isAdding && (
        <Card className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="mockName">
              <Input id="mockName" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Date taken" htmlFor="takenAt">
              <Input
                id="takenAt"
                type="date"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Section</th>
                  <th className="pb-2">Attempted</th>
                  <th className="pb-2">Correct</th>
                  <th className="pb-2">Marks</th>
                  <th className="pb-2">Out of</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((row, index) => (
                  <tr key={row.subjectId || index}>
                    <td className="py-1 pr-3">{row.name}</td>
                    {(['attempted', 'correct', 'marks', 'maxMarks'] as const).map((key) => (
                      <td key={key} className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          aria-label={`${row.name} ${key}`}
                          value={row[key]}
                          onChange={(e) => updateRow(index, { [key]: e.target.value })}
                          className="w-20"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} isLoading={save.isPending}>
              Save mock test
            </Button>
            <Button variant="ghost" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {analysis && analysis.count > 0 && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Score trend</h2>
              <span className="text-sm text-slate-500">
                average {analysis.averageScorePercent}%
                {analysis.improvement !== null && (
                  <span
                    className={
                      analysis.improvement >= 0
                        ? ' text-emerald-600 dark:text-emerald-400'
                        : ' text-red-600 dark:text-red-400'
                    }
                  >
                    {' '}
                    · {analysis.improvement >= 0 ? '+' : ''}
                    {analysis.improvement} points since the first
                  </span>
                )}
              </span>
            </div>

            <ul className="mt-4 space-y-2">
              {analysis.trend.map((mock) => (
                <li key={mock.id} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-500">{mock.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${mock.scorePercent ?? 0}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums">
                    {mock.scorePercent}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="mb-4">
            <h2 className="font-medium">Accuracy by subject</h2>
            <p className="mt-1 text-xs text-slate-500">
              Weakest first. Anything under 50% is dragging your score down.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {analysis.subjects.map((subject) => (
                <li
                  key={subject.subjectId ?? subject.subjectName}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span>{subject.subjectName}</span>
                  <span className="tabular-nums text-slate-500">
                    {subject.correct}/{subject.attempted} ·{' '}
                    <span className={`font-medium ${accuracyClass(subject.accuracy)}`}>
                      {subject.accuracy}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {analysis.weakestSubjects[0]?.accuracy !== undefined &&
              analysis.weakestSubjects[0].accuracy !== null &&
              analysis.weakestSubjects[0].accuracy < 60 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  <strong>{analysis.weakestSubjects[0].subjectName}</strong> is your weakest at{' '}
                  {analysis.weakestSubjects[0].accuracy}% accuracy. Its topics have been pushed up
                  your priority list.
                </p>
              )}
          </Card>
        </>
      )}

      {mocks && mocks.length > 0 && (
        <Card>
          <h2 className="font-medium">All attempts</h2>
          <ul className="mt-3 space-y-3">
            {[...mocks].reverse().map((mock) => (
              <li key={mock.id} className="border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{mock.name}</span>
                  <span className="text-sm text-slate-500">
                    {new Date(mock.takenAt).toLocaleDateString()} · {mock.obtainedMarks}/
                    {mock.totalMarks} ·{' '}
                    <span className={accuracyClass(mock.accuracy)}>{mock.accuracy}% accuracy</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete "${mock.name}"?`)) remove.mutate(mock.id);
                      }}
                      className="ml-3 text-xs text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {mock.sections.map((section) => (
                    <span key={section.id}>
                      {section.subjectName ?? section.name}{' '}
                      <span className={accuracyClass(section.accuracy)}>
                        {section.correct}/{section.attempted}
                      </span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mocks && mocks.length === 0 && !isAdding && examId && (
        <Card>
          <h2 className="font-medium">No mock tests yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record your first attempt and you will see the trend build up, plus which subject is
            costing you the most marks.
          </p>
        </Card>
      )}
    </AppShell>
  );
}
