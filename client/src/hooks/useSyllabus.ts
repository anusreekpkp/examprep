import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as syllabus from '@/lib/syllabus';

export const examKeys = {
  all: ['exams'] as const,
  tree: (examId: string) => ['exams', examId] as const,
  templates: ['templates'] as const,
};

export function useTemplates() {
  return useQuery({
    queryKey: examKeys.templates,
    queryFn: syllabus.fetchTemplates,
    // Templates are seeded data that never changes during a session.
    staleTime: Infinity,
  });
}

export function useExams() {
  return useQuery({ queryKey: examKeys.all, queryFn: syllabus.fetchExams });
}

export function useExamTree(examId: string | undefined) {
  return useQuery({
    queryKey: examKeys.tree(examId ?? ''),
    queryFn: () => syllabus.fetchExamTree(examId as string),
    enabled: Boolean(examId),
  });
}

/**
 * Every syllabus mutation changes both the tree and the summary counts on the
 * exam list, so both are invalidated rather than hand-patching the cache.
 */
function useSyllabusMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  examId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.all });
      if (examId) {
        await queryClient.invalidateQueries({ queryKey: examKeys.tree(examId) });
      }
    },
  });
}

export function useCreateExam() {
  return useSyllabusMutation(syllabus.createExam);
}

export function useUpdateExam(examId: string) {
  return useSyllabusMutation(
    (payload: Parameters<typeof syllabus.updateExam>[1]) => syllabus.updateExam(examId, payload),
    examId,
  );
}

export function useDeleteExam() {
  return useSyllabusMutation(syllabus.deleteExam);
}

export function useCreateSubject(examId: string) {
  return useSyllabusMutation(
    (payload: { name: string; weightage?: number }) => syllabus.createSubject(examId, payload),
    examId,
  );
}

export function useUpdateSubject(examId: string) {
  return useSyllabusMutation(
    (args: { subjectId: string; name?: string; weightage?: number }) =>
      syllabus.updateSubject(args.subjectId, { name: args.name, weightage: args.weightage }),
    examId,
  );
}

export function useDeleteSubject(examId: string) {
  return useSyllabusMutation((subjectId: string) => syllabus.deleteSubject(subjectId), examId);
}

export function useReorderSubjects(examId: string) {
  return useSyllabusMutation((ids: string[]) => syllabus.reorderSubjects(examId, ids), examId);
}

export function useCreateTopic(examId: string) {
  return useSyllabusMutation(
    (args: {
      subjectId: string;
      name: string;
      parentTopicId?: string | null;
      estimatedMinutes?: number;
    }) =>
      syllabus.createTopic(args.subjectId, {
        name: args.name,
        parentTopicId: args.parentTopicId ?? null,
        ...(args.estimatedMinutes === undefined ? {} : { estimatedMinutes: args.estimatedMinutes }),
      }),
    examId,
  );
}

export function useUpdateTopic(examId: string) {
  return useSyllabusMutation(
    (args: { topicId: string } & Parameters<typeof syllabus.updateTopic>[1]) => {
      const { topicId, ...payload } = args;
      return syllabus.updateTopic(topicId, payload);
    },
    examId,
  );
}

export function useDeleteTopic(examId: string) {
  return useSyllabusMutation((topicId: string) => syllabus.deleteTopic(topicId), examId);
}
