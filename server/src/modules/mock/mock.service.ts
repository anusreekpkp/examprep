import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { assertExamOwned } from '../../utils/ownership.js';

const sectionSchema = z.object({
  subjectId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  attempted: z.number().int().min(0).max(1000),
  correct: z.number().int().min(0).max(1000),
  incorrect: z.number().int().min(0).max(1000).optional(),
  marks: z.number().min(-1000).max(1000),
  maxMarks: z.number().min(0).max(1000),
});

export const createMockSchema = z.object({
  name: z.string().trim().min(1).max(120),
  takenAt: z.coerce.date(),
  attemptNumber: z.number().int().min(1).max(999).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  notes: z.string().trim().max(2000).optional(),
  sections: z.array(sectionSchema).min(1, 'Record at least one section'),
});

export const updateMockSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    takenAt: z.coerce.date().optional(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type CreateMockInput = z.infer<typeof createMockSchema>;
export type UpdateMockInput = z.infer<typeof updateMockSchema>;

const mockSelect = {
  id: true,
  name: true,
  attemptNumber: true,
  takenAt: true,
  durationMinutes: true,
  totalMarks: true,
  obtainedMarks: true,
  notes: true,
  sections: {
    select: {
      id: true,
      name: true,
      subjectId: true,
      attempted: true,
      correct: true,
      incorrect: true,
      marks: true,
      maxMarks: true,
      subject: { select: { id: true, name: true } },
    },
  },
} as const;

/** correct / attempted, not correct / total: unattempted questions are not wrong. */
export function accuracyOf(correct: number, attempted: number): number | null {
  if (attempted <= 0) return null;
  return Math.round((correct / attempted) * 1000) / 10;
}

function percentOf(obtained: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((obtained / total) * 1000) / 10;
}

function shape(mock: {
  id: string;
  name: string;
  attemptNumber: number | null;
  takenAt: Date;
  durationMinutes: number | null;
  totalMarks: number;
  obtainedMarks: number;
  notes: string | null;
  sections: {
    id: string;
    name: string;
    subjectId: string | null;
    attempted: number;
    correct: number;
    incorrect: number;
    marks: number;
    maxMarks: number;
    subject: { id: string; name: string } | null;
  }[];
}) {
  const attempted = mock.sections.reduce((sum, s) => sum + s.attempted, 0);
  const correct = mock.sections.reduce((sum, s) => sum + s.correct, 0);

  return {
    id: mock.id,
    name: mock.name,
    attemptNumber: mock.attemptNumber,
    takenAt: mock.takenAt,
    durationMinutes: mock.durationMinutes,
    totalMarks: mock.totalMarks,
    obtainedMarks: mock.obtainedMarks,
    notes: mock.notes,
    scorePercent: percentOf(mock.obtainedMarks, mock.totalMarks),
    accuracy: accuracyOf(correct, attempted),
    attempted,
    correct,
    sections: mock.sections.map((section) => ({
      id: section.id,
      name: section.name,
      subjectId: section.subjectId,
      subjectName: section.subject?.name ?? null,
      attempted: section.attempted,
      correct: section.correct,
      incorrect: section.incorrect,
      marks: section.marks,
      maxMarks: section.maxMarks,
      accuracy: accuracyOf(section.correct, section.attempted),
      scorePercent: percentOf(section.marks, section.maxMarks),
    })),
  };
}

export async function createMock(userId: string, examId: string, input: CreateMockInput) {
  await assertExamOwned(examId, userId);

  // A section can be tied to a subject, but only one from this exam - otherwise
  // the per-subject analysis would silently mix papers.
  const subjectIds = input.sections.map((s) => s.subjectId).filter((id): id is string => Boolean(id));
  if (subjectIds.length > 0) {
    const owned = await prisma.subject.findMany({
      where: { examId, id: { in: subjectIds } },
      select: { id: true },
    });
    if (owned.length !== new Set(subjectIds).size) {
      throw ApiError.badRequest('One or more sections reference a subject from another exam');
    }
  }

  for (const section of input.sections) {
    if (section.correct > section.attempted) {
      throw ApiError.badRequest(
        `"${section.name}": correct answers cannot exceed attempted questions`,
      );
    }
    if (section.marks > section.maxMarks) {
      throw ApiError.badRequest(`"${section.name}": marks cannot exceed the section maximum`);
    }
  }

  // Totals are derived from the sections rather than trusted from the client,
  // so the headline score can never disagree with its own breakdown.
  const totalMarks = input.sections.reduce((sum, s) => sum + s.maxMarks, 0);
  const obtainedMarks = input.sections.reduce((sum, s) => sum + s.marks, 0);

  const attemptNumber =
    input.attemptNumber ??
    (await prisma.mockTest.count({ where: { examId, userId } })) + 1;

  const mock = await prisma.mockTest.create({
    data: {
      userId,
      examId,
      name: input.name,
      attemptNumber,
      takenAt: input.takenAt,
      totalMarks,
      obtainedMarks,
      ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      sections: {
        create: input.sections.map((section) => ({
          name: section.name,
          subjectId: section.subjectId ?? null,
          attempted: section.attempted,
          correct: section.correct,
          incorrect: section.incorrect ?? Math.max(0, section.attempted - section.correct),
          marks: section.marks,
          maxMarks: section.maxMarks,
        })),
      },
    },
    select: mockSelect,
  });

  return shape(mock);
}

export async function listMocks(userId: string, examId: string) {
  await assertExamOwned(examId, userId);

  const mocks = await prisma.mockTest.findMany({
    where: { examId, userId },
    orderBy: { takenAt: 'asc' },
    select: mockSelect,
  });

  return mocks.map(shape);
}

export async function updateMock(userId: string, mockId: string, input: UpdateMockInput) {
  const mock = await prisma.mockTest.findFirst({
    where: { id: mockId, userId },
    select: { id: true },
  });
  if (!mock) throw ApiError.notFound('Mock test not found');

  const updated = await prisma.mockTest.update({
    where: { id: mock.id },
    data: input,
    select: mockSelect,
  });
  return shape(updated);
}

export async function deleteMock(userId: string, mockId: string) {
  const mock = await prisma.mockTest.findFirst({
    where: { id: mockId, userId },
    select: { id: true },
  });
  if (!mock) throw ApiError.notFound('Mock test not found');
  await prisma.mockTest.delete({ where: { id: mock.id } });
}

// ---------------------------------------------------------------- analysis --

export interface SubjectAccuracy {
  subjectId: string | null;
  subjectName: string;
  attempted: number;
  correct: number;
  accuracy: number | null;
  marks: number;
  maxMarks: number;
  scorePercent: number | null;
}

/**
 * Per-subject accuracy across every mock, plus the score trend. This is what
 * turns a pile of results into "General Awareness is the problem".
 */
export async function analyseMocks(userId: string, examId: string) {
  await assertExamOwned(examId, userId);

  const mocks = await prisma.mockTest.findMany({
    where: { examId, userId },
    orderBy: { takenAt: 'asc' },
    select: mockSelect,
  });

  const shaped = mocks.map(shape);

  const bySubject = new Map<string, SubjectAccuracy>();
  for (const mock of shaped) {
    for (const section of mock.sections) {
      // Sections with no subject link are grouped by their own name instead.
      const key = section.subjectId ?? `name:${section.name.toLowerCase()}`;
      const existing = bySubject.get(key);
      const entry: SubjectAccuracy = existing ?? {
        subjectId: section.subjectId,
        subjectName: section.subjectName ?? section.name,
        attempted: 0,
        correct: 0,
        accuracy: null,
        marks: 0,
        maxMarks: 0,
        scorePercent: null,
      };
      entry.attempted += section.attempted;
      entry.correct += section.correct;
      entry.marks += section.marks;
      entry.maxMarks += section.maxMarks;
      entry.accuracy = accuracyOf(entry.correct, entry.attempted);
      entry.scorePercent = percentOf(entry.marks, entry.maxMarks);
      bySubject.set(key, entry);
    }
  }

  const subjects = [...bySubject.values()].sort(
    (a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101),
  );

  const trend = shaped.map((mock) => ({
    id: mock.id,
    name: mock.name,
    attemptNumber: mock.attemptNumber,
    takenAt: mock.takenAt,
    scorePercent: mock.scorePercent,
    accuracy: mock.accuracy,
  }));

  const withScores = trend.filter((t) => t.scorePercent !== null);
  const first = withScores[0]?.scorePercent ?? null;
  const latest = withScores.at(-1)?.scorePercent ?? null;

  return {
    count: shaped.length,
    trend,
    subjects,
    /** Lowest-accuracy subjects first; the list the student should act on. */
    weakestSubjects: subjects.filter((s) => s.accuracy !== null).slice(0, 3),
    improvement:
      first !== null && latest !== null && withScores.length > 1
        ? Math.round((latest - first) * 10) / 10
        : null,
    averageScorePercent:
      withScores.length > 0
        ? Math.round(
            (withScores.reduce((sum, t) => sum + (t.scorePercent ?? 0), 0) / withScores.length) *
              10,
          ) / 10
        : null,
  };
}

/**
 * Accuracy per subject for the priority engine, so a subject the student keeps
 * getting wrong in mocks raises the score of its unfinished topics.
 */
export async function subjectAccuracyMap(userId: string): Promise<Map<string, number>> {
  const sections = await prisma.mockTestSection.findMany({
    where: { mockTest: { userId }, subjectId: { not: null } },
    select: { subjectId: true, attempted: true, correct: true },
  });

  const totals = new Map<string, { attempted: number; correct: number }>();
  for (const section of sections) {
    if (!section.subjectId) continue;
    const entry = totals.get(section.subjectId) ?? { attempted: 0, correct: 0 };
    entry.attempted += section.attempted;
    entry.correct += section.correct;
    totals.set(section.subjectId, entry);
  }

  const accuracy = new Map<string, number>();
  for (const [subjectId, totalsForSubject] of totals) {
    // Below a handful of questions the rate is noise, not evidence.
    if (totalsForSubject.attempted < 10) continue;
    accuracy.set(subjectId, (totalsForSubject.correct / totalsForSubject.attempted) * 100);
  }
  return accuracy;
}
