import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  assertExamOwned,
  assertSubjectOwned,
  assertTopicOwned,
} from '../../utils/ownership.js';
import {
  templateStructureSchema,
  type CreateExamInput,
  type CreateSubjectInput,
  type CreateTopicInput,
  type ReorderInput,
  type TemplateStructure,
  type UpdateExamInput,
  type UpdateSubjectInput,
  type UpdateTopicInput,
} from './syllabus.schema.js';
import type { Difficulty, TopicStatus } from '../../generated/prisma/enums.js';

// ------------------------------------------------------------------ dates --

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between today and the exam, counted in calendar days rather than
 * elapsed hours - a student asking "how many days left" means sleeps, not 24h
 * blocks. Negative once the exam has passed.
 */
export function daysUntil(examDate: Date, now = new Date()): number {
  const startOfExamDay = Date.UTC(
    examDate.getUTCFullYear(),
    examDate.getUTCMonth(),
    examDate.getUTCDate(),
  );
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((startOfExamDay - startOfToday) / MS_PER_DAY);
}

// -------------------------------------------------------------- templates --

export async function listTemplates() {
  const templates = await prisma.syllabusTemplate.findMany({
    orderBy: { examName: 'asc' },
    select: { id: true, examName: true, description: true, structure: true },
  });

  return templates.map((template) => {
    const parsed = templateStructureSchema.safeParse(template.structure);
    const subjects = parsed.success ? parsed.data.subjects : [];
    return {
      id: template.id,
      examName: template.examName,
      description: template.description,
      subjectCount: subjects.length,
      topicCount: subjects.reduce((total, subject) => total + countTopics(subject.topics), 0),
      subjectNames: subjects.map((s) => s.name),
    };
  });
}

function countTopics(topics: TemplateStructure['subjects'][number]['topics']): number {
  return topics.reduce<number>(
    (total, topic) =>
      total + 1 + countTopics((topic.children ?? []) as TemplateStructure['subjects'][number]['topics']),
    0,
  );
}

// ------------------------------------------------------------------ exams --

export async function listExams(userId: string) {
  const exams = await prisma.exam.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { examDate: 'asc' }],
    include: {
      _count: { select: { subjects: true } },
      subjects: { select: { _count: { select: { topics: true } } } },
    },
  });

  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    examDate: exam.examDate,
    dailyAvailableMinutes: exam.dailyAvailableMinutes,
    isActive: exam.isActive,
    daysRemaining: daysUntil(exam.examDate),
    subjectCount: exam._count.subjects,
    topicCount: exam.subjects.reduce((total, s) => total + s._count.topics, 0),
    createdAt: exam.createdAt,
  }));
}

export async function createExam(userId: string, input: CreateExamInput) {
  if (daysUntil(input.examDate) < 0) {
    throw ApiError.badRequest('The exam date cannot be in the past');
  }

  const structure = input.templateId ? await loadTemplateStructure(input.templateId) : null;

  const exam = await prisma.$transaction(
    async (tx) => {
      const created = await tx.exam.create({
        data: {
          userId,
          name: input.name,
          examDate: input.examDate,
          dailyAvailableMinutes: input.dailyAvailableMinutes,
          ...(structure
            ? {
                subjects: {
                  create: structure.subjects.map((subject, subjectIndex) => ({
                    name: subject.name,
                    weightage: subject.weightage,
                    orderIndex: subjectIndex,
                    // Nested create covers the first level of topics in one
                    // write; deeper levels are filled in below.
                    topics: {
                      create: subject.topics.map((topic, topicIndex) => ({
                        name: topic.name,
                        orderIndex: topicIndex,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
        include: { subjects: { include: { topics: { select: { id: true, name: true } } } } },
      });

      if (structure) {
        await createNestedTemplateTopics(tx, created.subjects, structure);
      }

      return created;
    },
    // Cloning a large syllabus is chattier than the 5s default allows.
    { timeout: 30_000 },
  );

  return { id: exam.id, name: exam.name, examDate: exam.examDate };
}

async function loadTemplateStructure(templateId: string): Promise<TemplateStructure> {
  const template = await prisma.syllabusTemplate.findUnique({
    where: { id: templateId },
    select: { structure: true },
  });

  if (!template) throw ApiError.notFound('Syllabus template not found');

  const parsed = templateStructureSchema.safeParse(template.structure);
  if (!parsed.success) {
    throw ApiError.internal('This syllabus template is malformed and cannot be used');
  }
  return parsed.data;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Templates may nest sub-topics. The first level arrives via the nested create
 * above; anything deeper needs the parent's generated id, so it is written here
 * by walking each subject's tree.
 */
async function createNestedTemplateTopics(
  tx: TxClient,
  createdSubjects: { id: string; topics: { id: string; name: string }[] }[],
  structure: TemplateStructure,
): Promise<void> {
  for (const [subjectIndex, subject] of structure.subjects.entries()) {
    const createdSubject = createdSubjects[subjectIndex];
    if (!createdSubject) continue;

    for (const [topicIndex, topic] of subject.topics.entries()) {
      const children = (topic.children ?? []) as TemplateStructure['subjects'][number]['topics'];
      if (children.length === 0) continue;

      const createdTopic = createdSubject.topics[topicIndex];
      if (!createdTopic) continue;

      await createTopicBranch(tx, createdSubject.id, createdTopic.id, children);
    }
  }
}

async function createTopicBranch(
  tx: TxClient,
  subjectId: string,
  parentTopicId: string,
  topics: TemplateStructure['subjects'][number]['topics'],
): Promise<void> {
  for (const [index, topic] of topics.entries()) {
    const created = await tx.topic.create({
      data: { subjectId, parentTopicId, name: topic.name, orderIndex: index },
      select: { id: true },
    });
    const children = (topic.children ?? []) as TemplateStructure['subjects'][number]['topics'];
    if (children.length > 0) {
      await createTopicBranch(tx, subjectId, created.id, children);
    }
  }
}

export interface TopicNode {
  id: string;
  name: string;
  orderIndex: number;
  status: TopicStatus;
  difficulty: Difficulty;
  isStarred: boolean;
  isFrequentlyAsked: boolean;
  estimatedMinutes: number;
  totalStudyMinutes: number;
  revisionCount: number;
  lastStudiedAt: Date | null;
  children: TopicNode[];
}

export async function getExamTree(userId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    include: {
      subjects: {
        orderBy: { orderIndex: 'asc' },
        include: { topics: { orderBy: { orderIndex: 'asc' } } },
      },
    },
  });

  if (!exam) throw ApiError.notFound('Exam not found');

  const subjects = exam.subjects.map((subject) => {
    const nodes = buildTopicTree(subject.topics);
    return {
      id: subject.id,
      name: subject.name,
      orderIndex: subject.orderIndex,
      weightage: subject.weightage,
      colorHex: subject.colorHex,
      topicCount: subject.topics.length,
      topics: nodes,
    };
  });

  const allTopics = exam.subjects.flatMap((s) => s.topics);

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      examDate: exam.examDate,
      dailyAvailableMinutes: exam.dailyAvailableMinutes,
      isActive: exam.isActive,
      daysRemaining: daysUntil(exam.examDate),
    },
    subjects,
    stats: {
      totalTopics: allTopics.length,
      notStarted: allTopics.filter((t) => t.status === 'NOT_STARTED').length,
      learning: allTopics.filter((t) => t.status === 'LEARNING').length,
      revisionDue: allTopics.filter((t) => t.status === 'COMPLETED_REVISION_DUE').length,
      wellRevised: allTopics.filter((t) => t.status === 'WELL_REVISED').length,
      starred: allTopics.filter((t) => t.isStarred).length,
      estimatedMinutesRemaining: allTopics
        .filter((t) => t.status === 'NOT_STARTED' || t.status === 'LEARNING')
        .reduce((total, t) => total + t.estimatedMinutes, 0),
    },
  };
}

/**
 * Prisma cannot express arbitrary-depth self-relations, so topics are fetched
 * flat in one query and nested here. Depth-agnostic, and one round trip.
 */
function buildTopicTree(
  topics: {
    id: string;
    name: string;
    parentTopicId: string | null;
    orderIndex: number;
    status: TopicStatus;
    difficulty: Difficulty;
    isStarred: boolean;
    isFrequentlyAsked: boolean;
    estimatedMinutes: number;
    totalStudyMinutes: number;
    revisionCount: number;
    lastStudiedAt: Date | null;
  }[],
): TopicNode[] {
  const nodes = new Map<string, TopicNode>();
  for (const topic of topics) {
    nodes.set(topic.id, {
      id: topic.id,
      name: topic.name,
      orderIndex: topic.orderIndex,
      status: topic.status,
      difficulty: topic.difficulty,
      isStarred: topic.isStarred,
      isFrequentlyAsked: topic.isFrequentlyAsked,
      estimatedMinutes: topic.estimatedMinutes,
      totalStudyMinutes: topic.totalStudyMinutes,
      revisionCount: topic.revisionCount,
      lastStudiedAt: topic.lastStudiedAt,
      children: [],
    });
  }

  const roots: TopicNode[] = [];
  for (const topic of topics) {
    const node = nodes.get(topic.id);
    if (!node) continue;
    const parent = topic.parentTopicId ? nodes.get(topic.parentTopicId) : undefined;
    // A topic whose parent lives in another subject would otherwise vanish.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

export async function updateExam(userId: string, examId: string, input: UpdateExamInput) {
  await assertExamOwned(examId, userId);

  if (input.examDate && daysUntil(input.examDate) < 0) {
    throw ApiError.badRequest('The exam date cannot be in the past');
  }

  const exam = await prisma.exam.update({ where: { id: examId }, data: input });
  return { ...exam, daysRemaining: daysUntil(exam.examDate) };
}

export async function deleteExam(userId: string, examId: string) {
  await assertExamOwned(examId, userId);
  await prisma.exam.delete({ where: { id: examId } });
}

// --------------------------------------------------------------- subjects --

export async function createSubject(userId: string, examId: string, input: CreateSubjectInput) {
  await assertExamOwned(examId, userId);

  const last = await prisma.subject.aggregate({
    where: { examId },
    _max: { orderIndex: true },
  });

  return prisma.subject.create({
    data: {
      examId,
      name: input.name,
      orderIndex: (last._max.orderIndex ?? -1) + 1,
      ...(input.weightage === undefined ? {} : { weightage: input.weightage }),
      ...(input.colorHex === undefined ? {} : { colorHex: input.colorHex }),
    },
  });
}

export async function updateSubject(
  userId: string,
  subjectId: string,
  input: UpdateSubjectInput,
) {
  await assertSubjectOwned(subjectId, userId);
  return prisma.subject.update({ where: { id: subjectId }, data: input });
}

export async function deleteSubject(userId: string, subjectId: string) {
  await assertSubjectOwned(subjectId, userId);
  await prisma.subject.delete({ where: { id: subjectId } });
}

export async function reorderSubjects(userId: string, examId: string, input: ReorderInput) {
  await assertExamOwned(examId, userId);

  const owned = await prisma.subject.findMany({
    where: { examId, id: { in: input.ids } },
    select: { id: true },
  });

  if (owned.length !== input.ids.length) {
    throw ApiError.badRequest('One or more subjects do not belong to this exam');
  }

  await prisma.$transaction(
    input.ids.map((id, index) =>
      prisma.subject.update({ where: { id }, data: { orderIndex: index } }),
    ),
  );
}

// ----------------------------------------------------------------- topics --

export async function createTopic(userId: string, subjectId: string, input: CreateTopicInput) {
  await assertSubjectOwned(subjectId, userId);

  if (input.parentTopicId) {
    // A parent from a different subject would produce a topic that renders
    // nowhere, so reject it rather than silently orphaning the row.
    const parent = await prisma.topic.findFirst({
      where: { id: input.parentTopicId, subjectId },
      select: { id: true },
    });
    if (!parent) throw ApiError.badRequest('The parent topic must be in the same subject');
  }

  const last = await prisma.topic.aggregate({
    where: { subjectId, parentTopicId: input.parentTopicId ?? null },
    _max: { orderIndex: true },
  });

  return prisma.topic.create({
    data: {
      subjectId,
      parentTopicId: input.parentTopicId ?? null,
      name: input.name,
      orderIndex: (last._max.orderIndex ?? -1) + 1,
      ...(input.estimatedMinutes === undefined ? {} : { estimatedMinutes: input.estimatedMinutes }),
      ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
      ...(input.isStarred === undefined ? {} : { isStarred: input.isStarred }),
      ...(input.isFrequentlyAsked === undefined
        ? {}
        : { isFrequentlyAsked: input.isFrequentlyAsked }),
    },
  });
}

export async function updateTopic(userId: string, topicId: string, input: UpdateTopicInput) {
  await assertTopicOwned(topicId, userId);
  return prisma.topic.update({ where: { id: topicId }, data: input });
}

export async function deleteTopic(userId: string, topicId: string) {
  await assertTopicOwned(topicId, userId);
  // Child topics cascade via the self-relation, so sub-topics go too.
  await prisma.topic.delete({ where: { id: topicId } });
}

export async function reorderTopics(userId: string, subjectId: string, input: ReorderInput) {
  await assertSubjectOwned(subjectId, userId);

  const owned = await prisma.topic.findMany({
    where: { subjectId, id: { in: input.ids } },
    select: { id: true },
  });

  if (owned.length !== input.ids.length) {
    throw ApiError.badRequest('One or more topics do not belong to this subject');
  }

  await prisma.$transaction(
    input.ids.map((id, index) =>
      prisma.topic.update({ where: { id }, data: { orderIndex: index } }),
    ),
  );
}
