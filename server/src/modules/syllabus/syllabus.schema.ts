import { z } from 'zod';

// ------------------------------------------------------------------ exams --

export const createExamSchema = z.object({
  name: z.string().trim().min(2, 'Exam name must be at least 2 characters').max(120),
  /** ISO date string; refined below so a past date cannot be saved. */
  examDate: z.coerce.date(),
  dailyAvailableMinutes: z.number().int().min(15).max(1440).default(300),
  /** When present, the exam is seeded from a SyllabusTemplate. */
  templateId: z.string().min(1).optional(),
});

export const updateExamSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    examDate: z.coerce.date().optional(),
    dailyAvailableMinutes: z.number().int().min(15).max(1440).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

// --------------------------------------------------------------- subjects --

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, 'Subject name is required').max(120),
  weightage: z.number().int().min(0).max(100).optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #4f46e5')
    .optional(),
});

export const updateSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    weightage: z.number().int().min(0).max(100).optional(),
    colorHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #4f46e5')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

// ----------------------------------------------------------------- topics --

export const createTopicSchema = z.object({
  name: z.string().trim().min(1, 'Topic name is required').max(200),
  /** Set to nest this topic under another topic in the same subject. */
  parentTopicId: z.string().min(1).nullable().optional(),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  difficulty: z.enum(['EASY', 'MODERATE', 'DIFFICULT']).optional(),
  isStarred: z.boolean().optional(),
  isFrequentlyAsked: z.boolean().optional(),
});

/**
 * Note: `status` is intentionally absent. Marking a topic complete has to seed
 * the revision ladder, which is Phase 4's job, so status changes get their own
 * endpoint rather than riding along on a generic patch.
 */
export const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    estimatedMinutes: z.number().int().min(5).max(600).optional(),
    difficulty: z.enum(['EASY', 'MODERATE', 'DIFFICULT']).optional(),
    isStarred: z.boolean().optional(),
    isFrequentlyAsked: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

/**
 * Status lives on its own endpoint rather than in updateTopicSchema because a
 * transition has side effects - timestamps now, and the revision ladder in
 * Phase 4 - which a generic field patch should not silently trigger.
 */
export const updateTopicStatusSchema = z.object({
  status: z.enum(['NOT_STARTED', 'LEARNING', 'COMPLETED_REVISION_DUE', 'WELL_REVISED']),
  /** Optional self-assessment captured at the same moment. */
  difficulty: z.enum(['EASY', 'MODERATE', 'DIFFICULT']).optional(),
});

export const reorderSchema = z.object({
  /** Full list of sibling ids in their new order. */
  ids: z.array(z.string().min(1)).min(1, 'Provide the ids to reorder'),
});

// -------------------------------------------------------------- templates --

/** Shape of SyllabusTemplate.structure, which Prisma types only as Json. */
const templateTopicSchema: z.ZodType<{ name: string; children?: unknown[] }> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    children: z.array(templateTopicSchema).optional(),
  }),
);

export const templateStructureSchema = z.object({
  subjects: z.array(
    z.object({
      name: z.string().min(1),
      weightage: z.number().int().min(0).max(100).default(25),
      topics: z.array(templateTopicSchema).default([]),
    }),
  ),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type UpdateTopicStatusInput = z.infer<typeof updateTopicStatusSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
export type TemplateStructure = z.infer<typeof templateStructureSchema>;
