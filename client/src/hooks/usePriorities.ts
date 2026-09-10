import { useQuery } from '@tanstack/react-query';
import { fetchPriorities } from '@/lib/priorities';

export const priorityKeys = {
  /**
   * The limit is part of the key. Without it the dashboard's top-3 request and
   * the full page's top-25 request share a cache entry, and whichever ran first
   * truncates the other.
   */
  list: (examId: string | undefined, limit: number) =>
    ['priorities', examId ?? 'all', limit] as const,
};

export function usePriorities(examId?: string, limit = 20) {
  return useQuery({
    queryKey: priorityKeys.list(examId, limit),
    queryFn: () => fetchPriorities(examId, limit),
    // Scores shift as revisions fall due and sessions are logged, so this is
    // recomputed rather than cached hard.
    staleTime: 30_000,
  });
}
