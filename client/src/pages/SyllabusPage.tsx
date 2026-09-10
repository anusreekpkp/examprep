import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card } from '@/components/ui';
import { SubjectCard } from '@/components/syllabus/SubjectCard';
import { InlineForm } from '@/components/syllabus/InlineForm';
import { extractErrorMessage } from '@/lib/api';
import {
  formatMinutes,
  type Difficulty,
  type SubjectNode,
  type TopicNode,
  type TopicStatus,
} from '@/lib/syllabus';
import {
  useCreateSubject,
  useCreateTopic,
  useDeleteSubject,
  useDeleteTopic,
  useExamTree,
  useReorderSubjects,
  useUpdateSubject,
  useUpdateTopic,
  useUpdateTopicStatus,
} from '@/hooks/useSyllabus';

export default function SyllabusPage() {
  const { examId } = useParams<{ examId: string }>();
  const { data, isPending, isError, error } = useExamTree(examId);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const id = examId ?? '';
  const createSubject = useCreateSubject(id);
  const updateSubject = useUpdateSubject(id);
  const deleteSubject = useDeleteSubject(id);
  const reorderSubjects = useReorderSubjects(id);
  const createTopic = useCreateTopic(id);
  const updateTopic = useUpdateTopic(id);
  const deleteTopic = useDeleteTopic(id);
  const updateStatus = useUpdateTopicStatus(id);

  /** Mutations surface one shared error line rather than failing silently. */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(extractErrorMessage(err, fallback));
    }
  };

  const handleMove = (subjectId: string, direction: -1 | 1) => {
    if (!data) return;
    const ids = data.subjects.map((s) => s.id);
    const from = ids.indexOf(subjectId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
    void run(() => reorderSubjects.mutateAsync(ids), 'Could not reorder subjects');
  };

  const handleDeleteSubject = (subject: SubjectNode) => {
    const warning =
      subject.topicCount > 0
        ? `Delete "${subject.name}" and its ${subject.topicCount} topics?`
        : `Delete "${subject.name}"?`;
    if (!window.confirm(warning)) return;
    void run(() => deleteSubject.mutateAsync(subject.id), 'Could not delete the subject');
  };

  const handleDeleteTopic = (topicId: string, name: string, childCount: number) => {
    const warning =
      childCount > 0
        ? `Delete "${name}" and its ${childCount} sub-topic${childCount === 1 ? '' : 's'}?`
        : `Delete "${name}"?`;
    if (!window.confirm(warning)) return;
    void run(() => deleteTopic.mutateAsync(topicId), 'Could not delete the topic');
  };

  const handleStatusChange = (topicId: string, status: TopicStatus) => {
    void run(
      () => updateStatus.mutateAsync({ topicId, status }),
      'Could not update the topic status',
    );
  };

  const handleDifficultyChange = (topicId: string, difficulty: Difficulty) => {
    void run(
      () => updateTopic.mutateAsync({ topicId, difficulty }),
      'Could not update the difficulty',
    );
  };

  const handleEstimateChange = async (topicId: string, minutes: number) => {
    await run(
      () => updateTopic.mutateAsync({ topicId, estimatedMinutes: minutes }),
      'Could not update the time estimate',
    );
  };

  const handleToggleStar = (topic: TopicNode) => {
    void run(
      () => updateTopic.mutateAsync({ topicId: topic.id, isStarred: !topic.isStarred }),
      'Could not update the topic',
    );
  };

  if (isPending) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading syllabus…</p>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <Alert>{extractErrorMessage(error, 'Could not load this exam')}</Alert>
        <Link to="/exams" className="mt-4 inline-block">
          <Button variant="ghost">Back to exams</Button>
        </Link>
      </AppShell>
    );
  }

  const { exam, subjects, stats } = data;
  // Server-side weighted figure: Learning counts half, Revision due 0.8,
  // Well revised full. See server/src/modules/progress/statusWeight.ts.
  const percent = stats.completionPercent;

  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/exams" className="text-sm text-slate-500 hover:underline">
          ← All exams
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{exam.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(exam.examDate).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {formatMinutes(exam.dailyAvailableMinutes)} available daily
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums text-brand-600">
              {exam.daysRemaining < 0 ? '—' : exam.daysRemaining}
            </p>
            <p className="text-xs text-slate-500">days remaining</p>
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Syllabus covered</span>
          <span className="tabular-nums text-slate-500">
            {percent}% of {stats.totalTopics} topics
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Not started" value={stats.notStarted} />
          <Stat label="Learning" value={stats.learning} />
          <Stat label="Revision due" value={stats.revisionDue} />
          <Stat label="Well revised" value={stats.wellRevised} />
        </dl>

        <p className="mt-4 text-sm text-slate-500">
          Roughly {formatMinutes(stats.estimatedMinutesRemaining)} of study left across{' '}
          {stats.notStarted + stats.learning} unfinished topics.
          {exam.daysRemaining > 0 &&
            ` That is about ${formatMinutes(
              Math.ceil(stats.estimatedMinutesRemaining / exam.daysRemaining),
            )} a day to finish in time.`}
        </p>
      </Card>

      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      <div className="space-y-3">
        {subjects.map((subject, index) => (
          <SubjectCard
            key={subject.id}
            subject={subject}
            isFirst={index === 0}
            isLast={index === subjects.length - 1}
            onMove={handleMove}
            onRenameSubject={async (subjectId, name) => {
              await run(
                () => updateSubject.mutateAsync({ subjectId, name }),
                'Could not rename the subject',
              );
            }}
            onDeleteSubject={handleDeleteSubject}
            onAddTopic={async (subjectId, name, parentTopicId) => {
              await run(
                () => createTopic.mutateAsync({ subjectId, name, parentTopicId }),
                'Could not add the topic',
              );
            }}
            onRenameTopic={async (topicId, name) => {
              await run(
                () => updateTopic.mutateAsync({ topicId, name }),
                'Could not rename the topic',
              );
            }}
            onDeleteTopic={handleDeleteTopic}
            onToggleStar={handleToggleStar}
            onStatusChange={handleStatusChange}
            onDifficultyChange={handleDifficultyChange}
            onEstimateChange={handleEstimateChange}
          />
        ))}
      </div>

      <div className="mt-4">
        {isAddingSubject ? (
          <Card className="p-4">
            <InlineForm
              placeholder="Subject name"
              submitLabel="Add subject"
              onSubmit={async (value) => {
                await run(
                  () => createSubject.mutateAsync({ name: value }),
                  'Could not add the subject',
                );
                setIsAddingSubject(false);
              }}
              onCancel={() => setIsAddingSubject(false)}
            />
          </Card>
        ) : (
          <Button variant="ghost" onClick={() => setIsAddingSubject(true)}>
            + Add subject
          </Button>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
