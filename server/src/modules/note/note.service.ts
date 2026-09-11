import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertExamOwned, assertTopicOwned } from '../../utils/ownership.js';

export const createNoteSchema = z.object({
  type: z.enum(['FORMULA', 'PERSONAL', 'QUESTION', 'SUMMARY', 'LINK']).default('PERSONAL'),
  title: z.string().trim().min(1, 'Give the note a title').max(200),
  /** Markdown for most types; for LINK the body is the URL plus any comment. */
  content: z.string().trim().min(1, 'A note needs some content').max(20_000),
  isPinned: z.boolean().optional(),
});

export const updateNoteSchema = z
  .object({
    type: z.enum(['FORMULA', 'PERSONAL', 'QUESTION', 'SUMMARY', 'LINK']).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(20_000).optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

const noteSelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  topic: {
    select: {
      id: true,
      name: true,
      subject: { select: { id: true, name: true, examId: true } },
    },
  },
} as const;

export async function listTopicNotes(userId: string, topicId: string) {
  await assertTopicOwned(topicId, userId);

  return prisma.note.findMany({
    where: { topicId, userId },
    // Pinned first, then newest: a formula you keep forgetting should not sink.
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    select: noteSelect,
  });
}

/** Every note across an exam, for browsing and searching in one place. */
export async function listExamNotes(userId: string, examId: string, search?: string) {
  await assertExamOwned(examId, userId);

  const term = search?.trim();

  return prisma.note.findMany({
    where: {
      userId,
      topic: { subject: { examId } },
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { content: { contains: term, mode: 'insensitive' } },
              { topic: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: noteSelect,
  });
}

export async function createNote(userId: string, topicId: string, input: CreateNoteInput) {
  await assertTopicOwned(topicId, userId);

  return prisma.note.create({
    data: {
      userId,
      topicId,
      type: input.type,
      title: input.title,
      content: input.content,
      ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
    },
    select: noteSelect,
  });
}

export async function updateNote(userId: string, noteId: string, input: UpdateNoteInput) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  if (!note) throw ApiError.notFound('Note not found');

  return prisma.note.update({ where: { id: note.id }, data: input, select: noteSelect });
}

export async function deleteNote(userId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  if (!note) throw ApiError.notFound('Note not found');
  await prisma.note.delete({ where: { id: note.id } });
}

/** Note counts per topic, so the syllabus tree can show a badge without N queries. */
export async function noteCountsByTopic(userId: string, examId: string) {
  const grouped = await prisma.note.groupBy({
    by: ['topicId'],
    where: { userId, topic: { subject: { examId } } },
    _count: { _all: true },
  });

  return Object.fromEntries(grouped.map((row) => [row.topicId, row._count._all]));
}
