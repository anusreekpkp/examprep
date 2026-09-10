import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { useCreateExam, useTemplates } from '@/hooks/useSyllabus';
import { extractErrorMessage } from '@/lib/api';

const schema = z.object({
  name: z.string().trim().min(2, 'Give the exam a name').max(120),
  examDate: z.string().min(1, 'Pick the exam date'),
  // Plain number, not z.coerce: coerce types the input as `unknown`, which
  // react-hook-form's Resolver will not accept. register() does the conversion.
  dailyHours: z
    .number({ message: 'Enter the hours as a number' })
    .min(0.5, 'At least 30 minutes a day')
    .max(16, 'That is more hours than anyone can sustain'),
});

type FormValues = z.infer<typeof schema>;

/** Tomorrow, so the date input cannot offer a value the API will reject. */
function minExamDate(): string {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return tomorrow.toISOString().slice(0, 10);
}

export default function ExamNewPage() {
  const navigate = useNavigate();
  const { data: templates, isPending: templatesLoading } = useTemplates();
  const createExam = useCreateExam();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { dailyHours: 5 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const exam = await createExam.mutateAsync({
        name: values.name,
        examDate: values.examDate,
        dailyAvailableMinutes: Math.round(values.dailyHours * 60),
        ...(templateId ? { templateId } : {}),
      });
      navigate(`/exams/${exam.id}`, { replace: true });
    } catch (error) {
      setFormError(extractErrorMessage(error, 'Could not create the exam'));
    }
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Add an exam</h1>
        <p className="mt-1 text-sm text-slate-500">
          Start from a ready syllabus or build your own. You can edit everything afterwards.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {formError && <Alert>{formError}</Alert>}

        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exam name" htmlFor="name" error={errors.name?.message}>
              <Input
                id="name"
                placeholder="SSC CGL 2027"
                hasError={Boolean(errors.name)}
                {...register('name')}
              />
            </Field>

            <Field label="Exam date" htmlFor="examDate" error={errors.examDate?.message}>
              <Input
                id="examDate"
                type="date"
                min={minExamDate()}
                hasError={Boolean(errors.examDate)}
                {...register('examDate')}
              />
            </Field>

            <Field
              label="Hours you can study daily"
              htmlFor="dailyHours"
              error={errors.dailyHours?.message}
              hint="Used to spread the remaining syllabus across the days you have left."
            >
              <Input
                id="dailyHours"
                type="number"
                step="0.5"
                min="0.5"
                max="16"
                hasError={Boolean(errors.dailyHours)}
                {...register('dailyHours', { valueAsNumber: true })}
              />
            </Field>
          </div>
        </Card>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Starting syllabus
          </h2>

          {templatesLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading templates…</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(templates ?? []).map((template) => {
                const selected = templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    aria-pressed={selected}
                    className={`rounded-xl border p-4 text-left transition ${
                      selected
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <p className="font-medium">{template.examName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {template.subjectCount} subjects · {template.topicCount} topics
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                      {template.subjectNames.join(' · ')}
                    </p>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setTemplateId(null)}
                aria-pressed={templateId === null}
                className={`rounded-xl border p-4 text-left transition ${
                  templateId === null
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <p className="font-medium">Start empty</p>
                <p className="mt-1 text-xs text-slate-500">
                  Add your own subjects and topics from scratch.
                </p>
              </button>
            </div>
          )}
        </section>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSubmitting}>
            Create exam
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/exams')}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
