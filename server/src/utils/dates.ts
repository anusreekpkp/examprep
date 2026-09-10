/**
 * Revision scheduling is calendar-day arithmetic, not elapsed-hours arithmetic:
 * a revision due "tomorrow" means the student's tomorrow, wherever they are.
 *
 * So every scheduled date is stored as UTC midnight of the target calendar day
 * and compared against the student's *local* day. Storing a wall-clock instant
 * instead would make a revision arrive on the wrong side of midnight for anyone
 * east of UTC - which is everyone this app is built for.
 */

const MS_PER_DAY = 86_400_000;

/** "2026-09-10" for the given instant as seen in `timeZone`. */
export function localDateKey(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and parses cleanly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** The UTC instant representing midnight of a "YYYY-MM-DD" day key. */
export function dateKeyToUtcMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const shifted = new Date(dateKeyToUtcMidnight(dateKey).getTime() + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** Whole calendar days from `fromKey` to `toKey`; negative when in the past. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round(
    (dateKeyToUtcMidnight(toKey).getTime() - dateKeyToUtcMidnight(fromKey).getTime()) / MS_PER_DAY,
  );
}

/** Falls back to UTC rather than throwing if a stored timezone is unusable. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}
