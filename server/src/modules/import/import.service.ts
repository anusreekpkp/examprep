import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertExamOwned } from '../../utils/ownership.js';
import { extractSyllabusText } from './extract.js';
import { parseSyllabus } from './parseSyllabus.js';

/** One level of nesting, matching what the parser produces and the UI edits. */
const importTopicSchema = z.object({
  name: z.string().trim().min(1).max(200),
  children: z.array(z.string().trim().min(1).max(200)).default([]),
});

export const applyImportSchema = z.object({
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        topics: z.array(importTopicSchema).default([]),
      }),
    )
    .min(1, 'Keep at least one subject to import'),
});

export type ApplyImportInput = z.infer<typeof applyImportSchema>;

/** Strips the extension so "SSC-CGL-syllabus.pdf" becomes a usable subject name. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported syllabus';
}

export async function importSyllabus(
  userId: string,
  examId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
) {
  await assertExamOwned(examId, userId);

  const extraction = await extractSyllabusText(file.buffer, file.mimetype);
  const parsed = parseSyllabus(extraction.text, baseName(file.originalname));

  // The text is stored whether or not the student ends up applying the parse,
  // so a re-parse later never needs another upload.
  const record = await prisma.syllabusImport.create({
    data: {
      examId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      source: extraction.source,
      extractedText: extraction.text,
      characterCount: extraction.text.length,
    },
    select: { id: true, fileName: true, source: true, characterCount: true, createdAt: true },
  });

  return {
    import: { ...record, pageCount: extraction.pageCount },
    preview: parsed,
    extractedText: extraction.text,
  };
}

export async function listImports(userId: string, examId: string) {
  await assertExamOwned(examId, userId);

  return prisma.syllabusImport.findMany({
    where: { examId },
    orderBy: { createdAt: 'desc' },
    // extractedText is deliberately excluded: a listing does not need to ship
    // hundreds of kilobytes of syllabus text.
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      source: true,
      characterCount: true,
      appliedAt: true,
      subjectsCreated: true,
      topicsCreated: true,
      createdAt: true,
    },
  });
}

export async function getImportText(userId: string, importId: string) {
  const record = await prisma.syllabusImport.findFirst({
    where: { id: importId, exam: { userId } },
    select: {
      id: true,
      fileName: true,
      source: true,
      extractedText: true,
      characterCount: true,
      createdAt: true,
      appliedAt: true,
    },
  });
  if (!record) throw ApiError.notFound('Import not found');
  return record;
}

/**
 * Writes the reviewed tree into the exam. The student's edited version is the
 * input, not the stored parse - the parser only ever proposes.
 */
export async function applyImport(userId: string, importId: string, input: ApplyImportInput) {
  const record = await prisma.syllabusImport.findFirst({
    where: { id: importId, exam: { userId } },
    select: { id: true, examId: true, appliedAt: true },
  });
  if (!record) throw ApiError.notFound('Import not found');
  if (record.appliedAt) {
    throw ApiError.conflict('This import has already been applied to the syllabus');
  }

  const existingSubjects = await prisma.subject.findMany({
    where: { examId: record.examId },
    select: { id: true, name: true, orderIndex: true, topics: { select: { name: true } } },
  });

  let orderIndex = Math.max(-1, ...existingSubjects.map((s) => s.orderIndex)) + 1;
  let subjectsCreated = 0;
  let topicsCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      /** Creates a topic and its sub-topics, returning how many rows were written. */
      const createTopic = async (
        subjectId: string,
        topic: { name: string; children: string[] },
        position: number,
      ): Promise<number> => {
        const created = await tx.topic.create({
          data: { subjectId, name: topic.name, orderIndex: position },
          select: { id: true },
        });
        if (topic.children.length > 0) {
          await tx.topic.createMany({
            data: topic.children.map((name, index) => ({
              subjectId,
              parentTopicId: created.id,
              name,
              orderIndex: index,
            })),
          });
        }
        return 1 + topic.children.length;
      };

      for (const subject of input.subjects) {
        // Importing Paper 1 and Paper 2 separately often repeats a subject name.
        // Appending blindly would split one subject in two, so same-named
        // subjects merge and only genuinely new topics are added.
        const existing = existingSubjects.find(
          (candidate) => candidate.name.toLowerCase() === subject.name.toLowerCase(),
        );

        if (existing) {
          const taken = new Set(existing.topics.map((t) => t.name.toLowerCase()));
          const fresh = subject.topics.filter((topic) => !taken.has(topic.name.toLowerCase()));
          if (fresh.length === 0) continue;

          const last = await tx.topic.aggregate({
            where: { subjectId: existing.id, parentTopicId: null },
            _max: { orderIndex: true },
          });
          let topicOrder = (last._max.orderIndex ?? -1) + 1;

          for (const topic of fresh) {
            topicsCreated += await createTopic(existing.id, topic, topicOrder++);
          }
          continue;
        }

        const createdSubject = await tx.subject.create({
          data: { examId: record.examId, name: subject.name, orderIndex: orderIndex++ },
          select: { id: true },
        });
        subjectsCreated += 1;
        for (const [index, topic] of subject.topics.entries()) {
          topicsCreated += await createTopic(createdSubject.id, topic, index);
        }
      }

      await tx.syllabusImport.update({
        where: { id: record.id },
        data: { appliedAt: new Date(), subjectsCreated, topicsCreated },
      });
    },
    { timeout: 30_000 },
  );

  return { subjectsCreated, topicsCreated };
}

export async function deleteImport(userId: string, importId: string) {
  const record = await prisma.syllabusImport.findFirst({
    where: { id: importId, exam: { userId } },
    select: { id: true },
  });
  if (!record) throw ApiError.notFound('Import not found');
  // Only the stored text goes; subjects already applied to the syllabus stay.
  await prisma.syllabusImport.delete({ where: { id: record.id } });
}
