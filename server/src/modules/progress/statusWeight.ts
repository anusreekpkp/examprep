import type { TopicStatus } from '../../generated/prisma/enums.js';

/**
 * How much of a topic each status counts as "covered".
 *
 * Binary done/not-done would report a student who has learned every topic but
 * revised none as 0%, which is both wrong and demoralising. Partial credit makes
 * the number move as work happens, and makes revision visibly worth doing:
 * finishing the ladder is the difference between 0.8 and 1.
 *
 * Lives in its own module because both the syllabus tree and the progress
 * rollups need it, and importing one service from the other would be a cycle.
 */
export const STATUS_WEIGHT: Record<TopicStatus, number> = {
  NOT_STARTED: 0,
  LEARNING: 0.5,
  COMPLETED_REVISION_DUE: 0.8,
  WELL_REVISED: 1,
};

export function completionPercent(statuses: TopicStatus[]): number {
  if (statuses.length === 0) return 0;
  const covered = statuses.reduce((sum, status) => sum + STATUS_WEIGHT[status], 0);
  return Math.round((covered / statuses.length) * 100);
}
