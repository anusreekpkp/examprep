import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as sessions from '@/lib/sessions';
import { examKeys } from './useSyllabus';

export const sessionKeys = {
  active: ['sessions', 'active'] as const,
  list: (examId?: string) => ['sessions', 'list', examId ?? 'all'] as const,
  daily: ['sessions', 'daily'] as const,
};

export function useActiveSession() {
  return useQuery({
    queryKey: sessionKeys.active,
    queryFn: sessions.fetchActiveSession,
    // The running session is the source of truth for a reloaded tab.
    staleTime: 0,
  });
}

export function useSessionHistory(examId?: string, limit = 20) {
  return useQuery({
    queryKey: sessionKeys.list(examId),
    queryFn: () => sessions.fetchSessions(examId, limit),
  });
}

export function useDailyTotals(days = 7) {
  return useQuery({ queryKey: sessionKeys.daily, queryFn: () => sessions.fetchDailyTotals(days) });
}

/**
 * Finishing a session moves minutes onto a topic, can change its status and can
 * seed a revision ladder, so the syllabus and revision caches go stale too.
 */
function useSessionMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: examKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['revisions'] }),
      ]);
    },
  });
}

export function useStartSession() {
  return useSessionMutation(sessions.startSession);
}

export function useFinishSession() {
  return useSessionMutation(
    (args: { sessionId: string } & Parameters<typeof sessions.finishSession>[1]) => {
      const { sessionId, ...payload } = args;
      return sessions.finishSession(sessionId, payload);
    },
  );
}

export function useDiscardSession() {
  return useSessionMutation(sessions.discardSession);
}

/**
 * Seconds since `startedAt`, recomputed from the wall clock on every tick rather
 * than accumulated. An accumulating counter drifts, and stops entirely when the
 * browser throttles a background tab - which is exactly when a study timer is
 * most likely to be in the background.
 */
export function useElapsedSeconds(startedAt: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startedAt) {
      startRef.current = null;
      setElapsed(0);
      return;
    }

    startRef.current = new Date(startedAt).getTime();
    const tick = () => {
      if (startRef.current === null) return;
      setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
