import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/lib/api';

/** Phase 0 proof that the React app and the Express API actually talk to each other. */
export function ConnectionStatus() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  });

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        <span className="size-2 animate-pulse rounded-full bg-slate-400" />
        Contacting API…
      </span>
    );
  }

  if (isError) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-red-600">
        <span className="size-2 rounded-full bg-red-500" />
        API unreachable — is the server running on port 4000?
        <span className="text-xs text-red-400">({error.message})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-emerald-600">
      <span className="size-2 rounded-full bg-emerald-500" />
      API connected · {data.service} · {data.environment} · up {data.uptimeSeconds}s
    </span>
  );
}
