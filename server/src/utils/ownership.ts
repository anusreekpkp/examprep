import { prisma } from '../lib/prisma.js';
import { ApiError } from './ApiError.js';

/**
 * Every syllabus row is reachable from exactly one user through
 * exam -> subject -> topic. These helpers make that hop explicit so no handler
 * can accidentally read or mutate another student's data.
 *
 * They deliberately return 404 rather than 403 for a row owned by someone else:
 * confirming that an id exists would leak the shape of other users' data.
 */

export async function assertExamOwned(examId: string, userId: string): Promise<void> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    select: { id: true },
  });
  if (!exam) throw ApiError.notFound('Exam not found');
}

/** Returns the parent examId, which handlers need for reordering and responses. */
export async function assertSubjectOwned(subjectId: string, userId: string): Promise<string> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, exam: { userId } },
    select: { id: true, examId: true },
  });
  if (!subject) throw ApiError.notFound('Subject not found');
  return subject.examId;
}

export async function assertTopicOwned(
  topicId: string,
  userId: string,
): Promise<{ subjectId: string; examId: string }> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, subject: { exam: { userId } } },
    select: { subjectId: true, subject: { select: { examId: true } } },
  });
  if (!topic) throw ApiError.notFound('Topic not found');
  return { subjectId: topic.subjectId, examId: topic.subject.examId };
}
