import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as notes from '@/lib/notes';

export const noteKeys = {
  topic: (topicId: string) => ['notes', 'topic', topicId] as const,
  exam: (examId: string, search: string) => ['notes', 'exam', examId, search] as const,
};

export function useTopicNotes(topicId: string | undefined) {
  return useQuery({
    queryKey: noteKeys.topic(topicId ?? ''),
    queryFn: () => notes.fetchTopicNotes(topicId as string),
    enabled: Boolean(topicId),
  });
}

export function useExamNotes(examId: string | undefined, search = '') {
  return useQuery({
    queryKey: noteKeys.exam(examId ?? '', search),
    queryFn: () => notes.fetchExamNotes(examId as string, search || undefined),
    enabled: Boolean(examId),
  });
}

/** Any note change invalidates both the per-topic list and the exam-wide browser. */
function useNoteMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useCreateNote() {
  return useNoteMutation(
    (args: { topicId: string } & Parameters<typeof notes.createNote>[1]) => {
      const { topicId, ...payload } = args;
      return notes.createNote(topicId, payload);
    },
  );
}

export function useUpdateNote() {
  return useNoteMutation((args: { noteId: string } & Parameters<typeof notes.updateNote>[1]) => {
    const { noteId, ...payload } = args;
    return notes.updateNote(noteId, payload);
  });
}

export function useDeleteNote() {
  return useNoteMutation((noteId: string) => notes.deleteNote(noteId));
}
