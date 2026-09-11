import type { Difficulty, TopicStatus } from '../../generated/prisma/enums.js';

/**
 * Scores every topic so the app can answer "what should I study next?" instead
 * of leaving the student to decide from a list of two hundred items.
 *
 * The six positive components are weighted to sum to exactly 100, so a score is
 * readable as a percentage and no component can quietly dominate. The recency
 * penalty is then subtracted, which is what stops the same topic being
 * recommended three days running.
 *
 * Everything here is deterministic and hand-tunable on purpose. A trained model
 * would score better on paper and be impossible to explain to a student - or an
 * examiner - which is the wrong trade for a study tool whose whole value is
 * telling you *why* it picked something.
 */

export const COMPONENT_MAX = {
  examWeight: 18,
  coverageGap: 20,
  weakness: 18,
  /**
   * Deliberately the largest component, and larger than coverageGap. An
   * untouched topic earns full coverage points for free and is one of dozens of
   * equivalent options; an overdue revision is knowledge already paid for and
   * now being lost. With the two ceilings equal, a week-overdue revision sank
   * below eleven interchangeable "not started" topics - the opposite of the
   * advice this engine exists to give.
   */
  revisionDebt: 28,
  deadlinePressure: 10,
  flags: 6,
} as const;

export const RECENCY_PENALTY_MAX = 20;

export type ComponentKey = keyof typeof COMPONENT_MAX;

export interface PriorityInput {
  status: TopicStatus;
  difficulty: Difficulty;
  isStarred: boolean;
  isFrequentlyAsked: boolean;
  /** Subject's share of the paper, 0-100. */
  subjectWeightage: number;
  estimatedMinutes: number;
  totalStudyMinutes: number;
  lastStudiedAt: Date | null;
  /** Days past due for the most overdue pending revision; null if none is due. */
  daysOverdue: number | null;
  /** Whole days until the exam; negative once it has passed. */
  daysUntilExam: number;
  /** Whole days since the topic was last studied; null if never. */
  daysSinceStudied: number | null;
  /**
   * Mock-test accuracy for this topic's subject, 0-100, or null when too few
   * questions have been attempted for the rate to mean anything.
   */
  subjectAccuracy: number | null;
}

export interface PriorityBreakdown {
  score: number;
  components: Record<ComponentKey, number>;
  recencyPenalty: number;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

/** How much of the topic is still outstanding. */
function coverageGap(status: TopicStatus): number {
  switch (status) {
    case 'NOT_STARTED':
      return COMPONENT_MAX.coverageGap;
    case 'LEARNING':
      return COMPONENT_MAX.coverageGap * 0.6;
    case 'COMPLETED_REVISION_DUE':
      return COMPONENT_MAX.coverageGap * 0.25;
    case 'WELL_REVISED':
      return 0;
  }
}

/**
 * Self-reported difficulty, plus a signal the student may not have noticed:
 * time sunk well past the estimate without finishing is the "lots of hours on
 * Algebra, still not solid" case from the brief.
 */
function overrunRatio(input: PriorityInput): number {
  const unfinished = input.status === 'NOT_STARTED' || input.status === 'LEARNING';
  if (!unfinished || input.estimatedMinutes <= 0) return 0;
  return clamp(input.totalStudyMinutes / input.estimatedMinutes - 1, 0, 1);
}

/**
 * How badly the student is doing in this subject in mocks, 0-1. Measured
 * evidence, so it is weighted more heavily than the self-assessed difficulty:
 * 50% accuracy or below counts as fully weak, 80% and above as not weak at all.
 */
function mockWeakness(subjectAccuracy: number | null): number {
  if (subjectAccuracy === null) return 0;
  return clamp((80 - subjectAccuracy) / 30, 0, 1);
}

function weakness(input: PriorityInput): number {
  // MODERATE is the default every topic starts on, so it carries only a small
  // baseline: treating it as real evidence of weakness would add a constant to
  // every score and discriminate between nothing.
  const base =
    input.difficulty === 'DIFFICULT'
      ? COMPONENT_MAX.weakness * 0.75
      : input.difficulty === 'MODERATE'
        ? COMPONENT_MAX.weakness * 0.15
        : 0;

  return clamp(
    base +
      overrunRatio(input) * COMPONENT_MAX.weakness * 0.25 +
      mockWeakness(input.subjectAccuracy) * COMPONENT_MAX.weakness * 0.5,
    0,
    COMPONENT_MAX.weakness,
  );
}

/** Overdue revisions outrank almost everything; forgetting is expensive. */
function revisionDebt(daysOverdue: number | null): number {
  if (daysOverdue === null) return 0;
  if (daysOverdue < 0) return 0;
  // Due today already earns half the component; each further day adds more,
  // saturating after roughly a week so one ancient topic cannot monopolise.
  return clamp(COMPONENT_MAX.revisionDebt * (0.5 + daysOverdue * 0.08), 0, COMPONENT_MAX.revisionDebt);
}

/**
 * Rises as the exam approaches. It barely separates topics within one exam -
 * that is the point - but it correctly ranks a paper three weeks away above one
 * six months out when a student is preparing for both.
 */
function deadlinePressure(daysUntilExam: number): number {
  if (daysUntilExam < 0) return 0;
  const horizon = 120;
  return clamp(
    COMPONENT_MAX.deadlinePressure * (1 - Math.min(daysUntilExam, horizon) / horizon),
    0,
    COMPONENT_MAX.deadlinePressure,
  );
}

/**
 * Suppresses a topic the student has just worked on, so the list moves on
 * instead of recommending the same thing every day. Decays over four days.
 *
 * It does NOT apply while a revision is due. Recency is meant to stop repeated
 * *new study* of the same topic; a due revision is a different action, and
 * spaced repetition exists precisely to bring back something studied recently.
 * Without this exemption an overdue revision could be buried under untouched
 * topics, which is the opposite of what the ladder decided.
 */
function recencyPenalty(daysSinceStudied: number | null, hasRevisionDue: boolean): number {
  if (hasRevisionDue) return 0;
  if (daysSinceStudied === null) return 0;
  if (daysSinceStudied >= 4) return 0;
  return RECENCY_PENALTY_MAX * (1 - daysSinceStudied / 4);
}

/** Turns the two strongest components into words a student would actually use. */
const REASON_TEXT: Record<ComponentKey, string> = {
  revisionDebt: 'revision overdue',
  coverageGap: 'not started yet',
  weakness: 'marked difficult',
  examWeight: 'high-scoring subject',
  deadlinePressure: 'exam is close',
  flags: 'flagged important',
};

export function scoreTopic(input: PriorityInput): PriorityBreakdown {
  const components: Record<ComponentKey, number> = {
    examWeight: round1((clamp(input.subjectWeightage, 0, 100) / 100) * COMPONENT_MAX.examWeight),
    coverageGap: round1(coverageGap(input.status)),
    weakness: round1(weakness(input)),
    revisionDebt: round1(revisionDebt(input.daysOverdue)),
    deadlinePressure: round1(deadlinePressure(input.daysUntilExam)),
    flags: round1(
      (input.isStarred ? COMPONENT_MAX.flags * 0.65 : 0) +
        (input.isFrequentlyAsked ? COMPONENT_MAX.flags * 0.35 : 0),
    ),
  };

  const penalty = round1(recencyPenalty(input.daysSinceStudied, input.daysOverdue !== null));
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  const score = round1(clamp(total - penalty, 0, 100));

  const overrun = overrunRatio(input);
  // Weakness is only offered as a *reason* when there is real evidence for it.
  // The MODERATE baseline moves the score a little but saying "marked
  // difficult" about a topic sitting on the default would simply be untrue.
  const poorInMocks = mockWeakness(input.subjectAccuracy) > 0.25;
  const weaknessIsEvidenced = input.difficulty === 'DIFFICULT' || overrun > 0 || poorInMocks;

  const reasons = (Object.entries(components) as [ComponentKey, number][])
    .filter(([key, value]) => {
      if (value <= 0) return false;
      // Deadline pressure is identical for every topic in an exam, so it
      // explains nothing about why *this* one was picked.
      if (key === 'deadlinePressure') return false;
      if (key === 'weakness') return weaknessIsEvidenced;
      // Every subject contributes *some* exam weight, so only call it out when
      // the subject genuinely carries a large share of the paper. Describing a
      // 15%-weight subject as "high-scoring" is just false.
      if (key === 'examWeight') return input.subjectWeightage >= 35;
      // A topic awaiting revision still carries coverage points, but calling it
      // "not started" would be plainly untrue - the revision debt says it
      // better anyway.
      if (key === 'coverageGap' && components.revisionDebt > 0) return false;
      return true;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => {
      if (key === 'coverageGap' && input.status === 'LEARNING') return 'part-way through';
      if (key === 'weakness' && input.difficulty !== 'DIFFICULT') {
        // Measured mock accuracy is the stronger claim, so it wins the label.
        return poorInMocks ? 'low mock accuracy' : 'taking longer than estimated';
      }
      return REASON_TEXT[key];
    });

  if (reasons.length === 0) reasons.push('nothing outstanding');

  return { score, components, recencyPenalty: penalty, reasons };
}
