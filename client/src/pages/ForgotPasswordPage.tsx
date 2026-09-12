import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { extractErrorMessage, requestPasswordReset } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { WakingBanner } from '@/components/WakingBanner';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      setSent(await requestPasswordReset(values.email));
    } catch (error) {
      setFormError(extractErrorMessage(error, 'Could not send a reset link'));
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the email you signed up with and we will send you a link.
        </p>
      </div>

      <Card>
        {sent ? (
          <>
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              {sent}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              The link works once and expires in 30 minutes. Check your spam folder if it does
              not arrive.
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <WakingBanner />
            {formError && <Alert>{formError}</Alert>}

            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                hasError={Boolean(errors.email)}
                {...register('email')}
              />
            </Field>

            <Button type="submit" isLoading={isSubmitting} className="w-full">
              Send reset link
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
