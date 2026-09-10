import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as revisions from '@/lib/revisions';
import { examKeys } from './useSyllabus';
import type { Difficulty } from '@/lib/syllabus';

export const revisionKeys = {
  due: (examId?: string) => ['revisions', 'due', examId ?? 'all'] as const,
  upcoming: (examId: string) => ['revisions', 'upcoming', examId] as const,
};

export function useDueRevisions(examId?: string) {
  return useQuery({
    queryKey: revisionKeys.due(examId),
    queryFn: () => revisions.fetchDueRevisions(examId),
    // "Due today" goes stale at midnight, and a student may leave the tab open.
    staleTime: 60_000,
  });
}

export function useUpcomingRevisions(examId: string | undefined, days = 14) {
  return useQuery({
    queryKey: revisionKeys.upcoming(examId ?? ''),
    queryFn: () => revisions.fetchUpcoming(examId as string, days),
    enabled: Boolean(examId),
  });
}

/**
 * Rating a revision changes the schedule, the topic's status and every progress
 * rollup that counts it, so all three families are invalidated.
 */
function useRevisionMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['revisions'] }),
        queryClient.invalidateQueries({ queryKey: examKeys.all }),
      ]);
    },
  });
}

export function useCompleteRevision() {
  return useRevisionMutation((args: { revisionId: string; feedback: Difficulty }) =>
    revisions.completeRevision(args.revisionId, args.feedback),
  );
}

export function useSkipRevision() {
  return useRevisionMutation((revisionId: string) => revisions.skipRevision(revisionId));
}
