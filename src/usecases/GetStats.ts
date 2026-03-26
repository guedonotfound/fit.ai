import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const WEEKDAY_MAP: Record<number, string> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

interface InputDto {
  userId: string;
  from: string;
  to: string;
}

interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs.utc(dto.from).startOf("day");
    const toDate = dayjs.utc(dto.to).endOf("day");

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: { workoutSessions: true },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: workoutPlan.id,
        },
        startedAt: {
          gte: fromDate.toDate(),
          lte: toDate.toDate(),
        },
      },
    });

    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    const planCreationDate = dayjs(workoutPlan.createdAt).startOf("day");

    const totalDays = toDate.diff(fromDate, "day") + 1;

    for (let i = 0; i < totalDays; i++) {
      const day = fromDate.add(i, "day");
      const dateKey = day.format("YYYY-MM-DD");

      const isFuture = day.isAfter(dayjs.utc(), "day");

      const weekDayName = WEEKDAY_MAP[day.day()];
      const currentWorkoutDay = workoutPlan.workoutDays.find(
        (d) => d.weekDay === weekDayName,
      );

      if (day.isBefore(planCreationDate, "day")) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
        continue;
      }

      if (isFuture) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
        continue;
      }

      const daySessions = sessions.filter(
        (s) => s.workoutDayId === currentWorkoutDay?.id,
      );

      const workoutDayStarted = daySessions.length > 0;
      const workoutDayCompleted = daySessions.some(
        (s) => s.completedAt !== null,
      );

      consistencyByDay[dateKey] = { workoutDayCompleted, workoutDayStarted };

      if (currentWorkoutDay?.isRest) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: true,
          workoutDayStarted: true,
        };
      }
    }

    console.log(consistencyByDay);

    const completedSessions = sessions.filter((s) => s.completedAt !== null);
    const completedWorkoutsCount = completedSessions.length;
    const conclusionRate =
      sessions.length > 0 ? completedWorkoutsCount / sessions.length : 0;

    const totalTimeInSeconds = completedSessions.reduce((total, session) => {
      const start = dayjs.utc(session.startedAt);
      const end = dayjs.utc(session.completedAt!);
      return total + end.diff(start, "second");
    }, 0);

    const workoutStreak = await this.calculateStreak(
      workoutPlan.id,
      workoutPlan.workoutDays,
      toDate,
    );

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
    };
  }

  private async calculateStreak(
    workoutPlanId: string,
    workoutDays: Array<{
      id: string;
      weekDay: string;
      isRest: boolean;
      workoutSessions: Array<{ startedAt: Date; completedAt: Date | null }>;
    }>,
    currentDate: dayjs.Dayjs,
  ): Promise<number> {
    const workoutPlan = await prisma.workoutPlan.findUnique({
      where: {
        id: workoutPlanId,
      },
      select: {
        createdAt: true,
      },
    });

    const allSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: { workoutPlanId },
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        workoutDayId: true,
      },
    });

    let streak = 0;
    let day = currentDate;
    const createdAt = dayjs(workoutPlan?.createdAt).startOf("day");

    while (!day.isBefore(createdAt, "day")) {
      const weekDay = WEEKDAY_MAP[day.day()];
      const targetWorkoutDay = workoutDays.find((d) => d.weekDay === weekDay);

      if (!targetWorkoutDay) {
        day = day.subtract(1, "day");
        continue;
      }

      if (targetWorkoutDay.isRest) {
        streak++;
        day = day.subtract(1, "day");
        continue;
      }

      const hasCompletedSession = allSessions.some(
        (s) => s.workoutDayId === targetWorkoutDay.id,
      );

      if (hasCompletedSession) {
        streak++;
        day = day.subtract(1, "day");
        continue;
      }

      break;
    }

    return streak;
  }
}
