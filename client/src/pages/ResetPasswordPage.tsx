import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { extractErrorMessage, resetPassword } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

// Mirrors the server's rule so the student is told before a round trip.
const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      setDone(await resetPassword(token, values.password));
      // Every old session was revoked server-side, so signing in again is the
      // only correct next step.
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (error) {
      setFormError(extractErrorMessage(error, 'Could not reset your password'));
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signing in everywhere else will stop working once you save this.
        </p>
      </div>

      <Card>
        {!token ? (
          <Alert>
            This link is missing its token. Request a new reset link and open the most recent
            email.
          </Alert>
        ) : done ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            {done} Taking you to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && <Alert>{formError}</Alert>}

            <Field
              label="New password"
              htmlFor="password"
              error={errors.password?.message}
              hint="At least 8 characters, with a letter and a number."
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.password)}
                {...register('password')}
              />
            </Field>

            <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.confirm)}
                {...register('confirm')}
              />
            </Field>

            <Button type="submit" isLoading={isSubmitting} className="w-full">
              Save new password
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
