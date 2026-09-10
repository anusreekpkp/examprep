import { useServerStore } from '@/stores/serverStore';

/**
 * Shown while the axios interceptor is retrying through a Render cold start.
 * Without this the student sees a spinner for up to a minute with no idea why.
 */
export function WakingBanner() {
  const isWaking = useServerStore((s) => s.isWaking);

  if (!isWaking) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <span className="mt-0.5 size-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      <span>
        Waking up the server. The free hosting tier sleeps when idle, so the first request can
        take up to a minute. Retrying automatically.
      </span>
    </div>
  );
}
