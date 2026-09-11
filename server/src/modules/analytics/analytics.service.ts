import { prisma } from '../../lib/prisma.js';
import { addDaysToKey, localDateKey, safeTimeZone } from '../../utils/dates.js';
import { subjectAccuracyMap } from '../mock/mock.service.js';

export interface SubjectTime {
  subjectId: string;
  subjectName: string;
  minutes: number;
  accuracy: number | null;
  topicsCompleted: number;
  topicsTotal: number;
}

export interface Insight {
  tone: 'warning' | 'positive' | 'neutral';
  message: string;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayOf(dateKey: string): string {
  return WEEKDAY[new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()] ?? '';
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Counts back from today while each day has study time. Yesterday is allowed to
 * be the most recent day so the streak does not appear broken every morning
 * before the student has sat down.
 */
function currentStreak(minutesByDay: Map<string, number>, todayKey: string): number {
  let streak = 0;
  let cursor = todayKey;

  if (!minutesByDay.get(cursor)) {
    cursor = addDaysToKey(todayKey, -1);
    if (!minutesByDay.get(cursor)) return 0;
  }

  while ((minutesByDay.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

export async function studySummary(userId: string, days = 7, examId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);
  const todayKey = localDateKey(new Date(), timeZone);
  const fromKey = addDaysToKey(todayKey, -(days - 1));

  // Pulled a little wider than the window so streaks can run past its edge.
  const since = new Date(Date.now() - (days + 45) * 86_400_000);

  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      endedAt: { not: null },
      startedAt: { gte: since },
      ...(examId ? { topic: { subject: { examId } } } : {}),
    },
    select: {
      startedAt: true,
      durationSeconds: true,
      completion: true,
      topic: {
        select: { id: true, subject: { select: { id: true, name: true } } },
      },
    },
  });

  const minutesByDay = new Map<string, number>();
  const minutesBySubject = new Map<string, { name: string; minutes: number }>();
  let windowSeconds = 0;
  let windowSessions = 0;
  let completedTopics = 0;

  for (const session of sessions) {
    const key = localDateKey(session.startedAt, timeZone);
    const minutes = Math.round(session.durationSeconds / 60);
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + minutes);

    if (key >= fromKey && key <= todayKey) {
      windowSeconds += session.durationSeconds;
      windowSessions += 1;
      if (session.completion === 'YES') completedTopics += 1;

      const subject = session.topic?.subject;
      if (subject) {
        const entry = minutesBySubject.get(subject.id) ?? { name: subject.name, minutes: 0 };
        entry.minutes += minutes;
        minutesBySubject.set(subject.id, entry);
      }
    }
  }

  const byDay: { date: string; weekday: string; minutes: number }[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const key = addDaysToKey(fromKey, offset);
    byDay.push({ date: key, weekday: weekdayOf(key), minutes: minutesByDay.get(key) ?? 0 });
  }

  const accuracy = await subjectAccuracyMap(userId);

  const subjects = await prisma.subject.findMany({
    where: { exam: { userId, isActive: true, ...(examId ? { id: examId } : {}) } },
    select: {
      id: true,
      name: true,
      topics: { select: { status: true } },
    },
  });

  const bySubject: SubjectTime[] = subjects.map((subject) => ({
    subjectId: subject.id,
    subjectName: subject.name,
    minutes: minutesBySubject.get(subject.id)?.minutes ?? 0,
    accuracy: accuracy.get(subject.id) ?? null,
    topicsCompleted: subject.topics.filter(
      (topic) => topic.status === 'COMPLETED_REVISION_DUE' || topic.status === 'WELL_REVISED',
    ).length,
    topicsTotal: subject.topics.length,
  }));
  bySubject.sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = Math.round(windowSeconds / 60);
  const studiedDays = byDay.filter((day) => day.minutes > 0).length;
  const bestDay = [...byDay].sort((a, b) => b.minutes - a.minutes)[0];

  return {
    timeZone,
    from: fromKey,
    to: todayKey,
    days,
    totalMinutes,
    sessionCount: windowSessions,
    topicsCompleted: completedTopics,
    studiedDays,
    /** Averaged over the whole window, not just days studied - the honest figure. */
    averageDailyMinutes: days > 0 ? Math.round(totalMinutes / days) : 0,
    mostProductiveDay: bestDay && bestDay.minutes > 0 ? bestDay : null,
    currentStreak: currentStreak(minutesByDay, todayKey),
    byDay,
    bySubject,
    insights: buildInsights(bySubject, totalMinutes, days, studiedDays),
  };
}

/**
 * Turns the numbers into the sentences a student can act on. Each one needs
 * enough evidence behind it to be worth saying - an insight drawn from twenty
 * minutes of data is just noise with a warning icon.
 */
function buildInsights(
  bySubject: SubjectTime[],
  totalMinutes: number,
  days: number,
  studiedDays: number,
): Insight[] {
  const insights: Insight[] = [];
  const studied = bySubject.filter((subject) => subject.minutes > 0);

  // The headline case from the brief: hours going in, accuracy not coming out.
  const sinkhole = studied.find(
    (subject) => subject.accuracy !== null && subject.accuracy < 55 && subject.minutes >= 60,
  );
  if (sinkhole) {
    insights.push({
      tone: 'warning',
      message: `You have put ${formatMinutes(sinkhole.minutes)} into ${sinkhole.subjectName} this week, but your mock accuracy there is only ${Math.round(sinkhole.accuracy ?? 0)}%. Try practising questions rather than re-reading.`,
    });
  }

  const neglected = bySubject
    .filter((subject) => subject.topicsTotal > 0 && subject.minutes === 0)
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))[0];
  if (neglected && totalMinutes > 0) {
    // Only call the accuracy out when it is genuinely poor. Sorting the
    // untouched subjects by accuracy makes the first one "weakest" even when
    // it is the strongest subject overall, which would be a nonsense warning.
    const isActuallyWeak = neglected.accuracy !== null && neglected.accuracy < 60;
    insights.push({
      tone: isActuallyWeak ? 'warning' : 'neutral',
      message: isActuallyWeak
        ? `${neglected.subjectName} got no study time at all this week, and it is weak in mocks at ${Math.round(neglected.accuracy ?? 0)}%.`
        : `${neglected.subjectName} got no study time at all this week.`,
    });
  }

  if (studiedDays >= days - 1 && days >= 7) {
    insights.push({
      tone: 'positive',
      message: `You studied on ${studiedDays} of the last ${days} days. That consistency is worth more than any single long session.`,
    });
  } else if (studiedDays > 0 && studiedDays <= Math.floor(days / 2)) {
    insights.push({
      tone: 'neutral',
      message: `You studied on ${studiedDays} of the last ${days} days. Shorter sessions more often tend to beat occasional long ones.`,
    });
  }

  const strongest = studied.find(
    (subject) => subject.accuracy !== null && subject.accuracy >= 80 && subject.minutes >= 60,
  );
  if (strongest) {
    insights.push({
      tone: 'neutral',
      message: `${strongest.subjectName} is already at ${Math.round(strongest.accuracy ?? 0)}% accuracy. Time spent there is buying you less than the same time elsewhere.`,
    });
  }

  return insights;
}
