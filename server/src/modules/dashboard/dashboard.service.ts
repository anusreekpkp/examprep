import { prisma } from '../../lib/prisma.js';
import { addDaysToKey, dateKeyToUtcMidnight, localDateKey, safeTimeZone } from '../../utils/dates.js';
import { daysUntil } from '../syllabus/syllabus.service.js';
import { completionPercent } from '../progress/statusWeight.js';
import { getExamProgress } from '../progress/progress.service.js';
import { rankTopics } from '../priority/priority.service.js';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Everything the home screen needs, in one request.
 *
 * The dashboard previously assembled itself from four separate hooks, which on
 * a cold Render instance meant four sequential wake-up waits. It is also the one
 * screen where a half-loaded state is most obvious, so it is worth one query.
 */
export async function getDashboard(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, timezone: true },
  });
  const timeZone = safeTimeZone(user?.timezone);
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);
  const weekStartKey = addDaysToKey(todayKey, -6);

  const exam = await prisma.exam.findFirst({
    where: { userId, isActive: true, examDate: { gte: new Date(Date.now() - 86_400_000) } },
    orderBy: { examDate: 'asc' },
    select: {
      id: true,
      name: true,
      examDate: true,
      dailyAvailableMinutes: true,
      subjects: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          name: true,
          weightage: true,
          topics: { select: { status: true } },
        },
      },
    },
  });

  // Sessions are pulled for the streak window, which is wider than the report.
  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      endedAt: { not: null },
      startedAt: { gte: new Date(Date.now() - 120 * 86_400_000) },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      startedAt: true,
      durationSeconds: true,
      completion: true,
      topic: {
        select: {
          id: true,
          name: true,
          status: true,
          subject: { select: { id: true, name: true, examId: true } },
        },
      },
    },
  });

  const minutesByDay = new Map<string, number>();
  for (const session of sessions) {
    const key = localDateKey(session.startedAt, timeZone);
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + Math.round(session.durationSeconds / 60));
  }

  const yesterdayKey = addDaysToKey(todayKey, -1);
  const studiedTodayMinutes = minutesByDay.get(todayKey) ?? 0;
  const studiedYesterdayMinutes = minutesByDay.get(yesterdayKey) ?? 0;

  // Seven cells, oldest first, so the client can draw a week strip directly.
  const week: { date: string; weekday: string; minutes: number; isToday: boolean }[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const key = addDaysToKey(weekStartKey, offset);
    week.push({
      date: key,
      weekday: WEEKDAY[new Date(`${key}T00:00:00.000Z`).getUTCDay()] ?? '',
      minutes: minutesByDay.get(key) ?? 0,
      isToday: key === todayKey,
    });
  }

  /** Yesterday may be the most recent day, so the streak survives the morning. */
  let streak = 0;
  let cursor = minutesByDay.get(todayKey) ? todayKey : yesterdayKey;
  while ((minutesByDay.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }

  const weekMinutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const weekTargetMinutes = (exam?.dailyAvailableMinutes ?? 0) * 7;

  const inWeek = (date: Date) => localDateKey(date, timeZone) >= weekStartKey;
  const topicsCompletedThisWeek = sessions.filter(
    (s) => s.completion === 'YES' && inWeek(s.startedAt),
  ).length;

  const [revisionsDoneThisWeek, revisionsDueToday, plan] = await Promise.all([
    prisma.revision.count({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: dateKeyToUtcMidnight(weekStartKey) },
        topic: { subject: { exam: { userId } } },
      },
    }),
    prisma.revision.count({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: dateKeyToUtcMidnight(todayKey) },
        topic: { subject: { exam: { userId } } },
      },
    }),
    exam
      ? prisma.studyPlan.findFirst({
          where: { userId, examId: exam.id, planDate: dateKeyToUtcMidnight(todayKey) },
          select: {
            items: {
              select: { status: true, durationMinutes: true, activity: true },
            },
          },
        })
      : null,
  ]);

  const planItems = (plan?.items ?? []).filter((item) => item.activity !== 'BREAK');
  const planRemainingMinutes = planItems
    .filter((item) => item.status === 'PENDING')
    .reduce((sum, item) => sum + item.durationMinutes, 0);

  /** The most recent session that was on a topic and left it unfinished. */
  const resumable = sessions.find((s) => s.topic && s.completion !== 'YES');

  const allStatuses = (exam?.subjects ?? []).flatMap((subject) =>
    subject.topics.map((topic) => topic.status),
  );

  const ranked = exam ? await rankTopics(userId, { examId: exam.id, limit: 3 }) : null;

  /**
   * Pace comes from the progress service rather than being recomputed here: it
   * is the one number on this screen that can tell a student their plan does
   * not fit in the days left, and two implementations of that would drift.
   */
  const progress = exam ? await getExamProgress(userId, exam.id) : null;

  return {
    name: user?.name ?? 'there',
    timeZone,
    today: todayKey,
    exam: exam
      ? {
          id: exam.id,
          name: exam.name,
          examDate: exam.examDate,
          daysRemaining: daysUntil(exam.examDate, now),
          dailyAvailableMinutes: exam.dailyAvailableMinutes,
          subjectCount: exam.subjects.length,
          topicCount: allStatuses.length,
          completionPercent: completionPercent(allStatuses),
          /**
           * Per-subject coverage. One overall percentage hides a paper that is
           * 80% done in the easy subject and untouched in the heavy one.
           *
           * Ordered by weightage when the exam publishes it, and otherwise by
           * how far behind each subject is - with nothing to weight by, the
           * subject the student has covered least is the useful thing to lead
           * with, and syllabus order would just be alphabetical noise.
           */
          subjects: exam.subjects
            .filter((subject) => subject.topics.length > 0)
            .map((subject) => ({
              id: subject.id,
              name: subject.name,
              weightage: subject.weightage,
              topicCount: subject.topics.length,
              completionPercent: completionPercent(subject.topics.map((topic) => topic.status)),
            }))
            .sort((a, b) =>
              a.weightage !== null && b.weightage !== null
                ? b.weightage - a.weightage
                : a.completionPercent - b.completionPercent,
            ),
        }
      : null,
    todayStats: {
      studiedMinutes: studiedTodayMinutes,
      versusYesterdayMinutes: studiedTodayMinutes - studiedYesterdayMinutes,
      targetMinutes: exam?.dailyAvailableMinutes ?? 0,
      plannedTasks: planItems.length,
      plannedRemainingMinutes: planRemainingMinutes,
      hasPlan: Boolean(plan),
      revisionsDue: revisionsDueToday,
    },
    weekStats: {
      minutes: weekMinutes,
      targetMinutes: weekTargetMinutes,
      percent: weekTargetMinutes > 0 ? Math.round((weekMinutes / weekTargetMinutes) * 100) : 0,
      topicsCompleted: topicsCompletedThisWeek,
      revisionsDone: revisionsDoneThisWeek,
      sessions: sessions.filter((s) => inWeek(s.startedAt)).length,
    },
    pace: progress
      ? {
          ...progress.pace,
          estimatedMinutesRemaining: progress.overall.estimatedMinutesRemaining,
          weightedReadiness: progress.overall.weightedReadiness,
          neverRevised: progress.overall.neverRevised,
          weakTopics: progress.overall.weakTopics,
        }
      : null,
    streak: { current: streak, week },
    continueWith: resumable?.topic
      ? {
          topicId: resumable.topic.id,
          topicName: resumable.topic.name,
          subjectName: resumable.topic.subject.name,
          examId: resumable.topic.subject.examId,
          status: resumable.topic.status,
          lastStudiedAt: resumable.startedAt,
        }
      : null,
    priorities: ranked?.topics ?? [],
  };
}
