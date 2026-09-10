import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { clsx } from 'clsx';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white p-6 shadow-sm',
        'dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  hasError,
  ...props
  // ComponentProps rather than InputHTMLAttributes so `ref` is typed; React 19
  // passes it as an ordinary prop, so spreading it onto the input is enough.
}: ComponentProps<'input'> & { hasError?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={hasError || undefined}
      className={clsx(
        'w-full rounded-lg border px-3 py-2 text-sm outline-none transition',
        'bg-white dark:bg-slate-950',
        'focus:ring-2 focus:ring-brand-500/40',
        hasError
          ? 'border-red-400 focus:border-red-500'
          : 'border-slate-300 focus:border-brand-500 dark:border-slate-700',
        className,
      )}
    />
  );
}

export function Button({
  className,
  variant = 'primary',
  isLoading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  isLoading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary'
          ? 'bg-brand-600 text-white hover:bg-brand-700'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
    >
      {isLoading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {children}
    </div>
  );
}
