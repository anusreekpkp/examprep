import { addDaysToKey } from '../../utils/dates.js';
import type { Difficulty } from '../../generated/prisma/enums.js';

/**
 * Days after completion at which each revision falls due. Expanding gaps are the
 * whole point of spaced repetition: each successful recall buys a longer wait
 * before the next one.
 */
export const BASE_INTERVAL_DAYS = [1, 3, 7, 15, 30] as const;

export const FINAL_STAGE = BASE_INTERVAL_DAYS.length;

/**
 * How the student's own verdict stretches or compresses everything still ahead.
 *
 * This is the "adaptive" part, and it is deliberately a single multiplier rather
 * than a full SM-2 style ease factor: a student can be told in one sentence why
 * a topic came back sooner, which matters more here than squeezing out a better
 * retention curve.
 */
export const FEEDBACK_MULTIPLIER: Record<Difficulty, number> = {
  EASY: 1.5,
  MODERATE: 1,
  DIFFICULT: 0.5,
};

export interface PlannedRevision {
  stage: number;
  /** "YYYY-MM-DD" in the student's timezone. */
  scheduledForKey: string;
}

/** The full ladder, seeded when a topic is first marked complete. */
export function planInitialLadder(completedOnKey: string): PlannedRevision[] {
  return BASE_INTERVAL_DAYS.map((days, index) => ({
    stage: index + 1,
    scheduledForKey: addDaysToKey(completedOnKey, days),
  }));
}

/**
 * Reschedules the stages still ahead after `completedStage` was revised today.
 *
 * The gaps between the remaining stages are preserved and scaled, rather than
 * recomputed from scratch, so the ladder keeps expanding: rating one revision
 * Difficult pulls the next one closer without collapsing the whole schedule into
 * a cluster of same-day repeats.
 *
 * Every interval is at least one day, so "Difficult" can never schedule a
 * revision for the same day the student just did it.
 */
export function planRemainingLadder(
  completedStage: number,
  feedback: Difficulty,
  todayKey: string,
): PlannedRevision[] {
  const multiplier = FEEDBACK_MULTIPLIER[feedback];
  const anchor = BASE_INTERVAL_DAYS[completedStage - 1] ?? 0;

  const planned: PlannedRevision[] = [];
  for (let stage = completedStage + 1; stage <= FINAL_STAGE; stage += 1) {
    const base = BASE_INTERVAL_DAYS[stage - 1] ?? 0;
    const offset = Math.max(1, Math.round((base - anchor) * multiplier));
    planned.push({ stage, scheduledForKey: addDaysToKey(todayKey, offset) });
  }

  return planned;
}

/**
 * A Difficult verdict on the last stage would otherwise end the ladder on the
 * student's weakest note, so it earns one more pass instead of graduating.
 */
export function shouldRepeatFinalStage(completedStage: number, feedback: Difficulty): boolean {
  return completedStage >= FINAL_STAGE && feedback === 'DIFFICULT';
}

/** Plain-language reason shown next to a rescheduled topic. */
export function explainFeedback(feedback: Difficulty, nextInDays: number | null): string {
  if (nextInDays === null) {
    return feedback === 'DIFFICULT'
      ? 'Marked difficult on the last revision, so it comes back once more.'
      : 'Revision ladder complete - this topic is well revised.';
  }
  const when = nextInDays === 1 ? 'tomorrow' : `in ${nextInDays} days`;
  switch (feedback) {
    case 'EASY':
      return `Recalled easily, so the next revision is pushed back - ${when}.`;
    case 'MODERATE':
      return `Next revision stays on schedule, ${when}.`;
    case 'DIFFICULT':
      return `Marked difficult, so it comes back sooner - ${when}.`;
  }
}
