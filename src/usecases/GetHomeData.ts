import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { WeekDay } from "../generated/prisma/enums.js";
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
  date: string;
}

interface OutputDto {
  activeWorkoutPlanId?: string;
  todayWorkoutDay?: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const currentDate = dayjs.utc(dto.date);

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: {
            exercises: true,
            workoutSessions: true,
          },
        },
      },
    });

    const todayWeekDay = WEEKDAY_MAP[currentDate.day()];
    const todayWorkoutDay = workoutPlan?.workoutDays.find(
      (day) => day.weekDay === todayWeekDay,
    );

    const weekStart = currentDate.day(0).startOf("day");
    const weekEnd = currentDate.day(6).endOf("day");

    const weekSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: workoutPlan?.id,
        },
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
    });

    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, "day");
      const dateKey = day.format("YYYY-MM-DD");

      const planCreationDate = dayjs(workoutPlan?.createdAt).startOf("day");
      const isBeforeCreation = day.isBefore(planCreationDate, "day");

      const currentWorkoutDay = workoutPlan?.workoutDays[i];

      const daySessions = weekSessions.filter(
        (s) => s.workoutDayId === currentWorkoutDay?.id,
      );

      const workoutDayStarted = daySessions.length > 0;
      const workoutDayCompleted = daySessions.some(
        (s) => s.completedAt !== null,
      );

      if (isBeforeCreation) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
        continue;
      }

      consistencyByDay[dateKey] = { workoutDayCompleted, workoutDayStarted };

      if (currentWorkoutDay?.isRest) {
        const isNotFuture = !day.isAfter(currentDate, "day");

        if (isNotFuture) {
          consistencyByDay[dateKey] = {
            workoutDayCompleted: true,
            workoutDayStarted: true,
          };
        }
      }
    }

    let workoutStreak = 0;

    if (workoutPlan) {
      workoutStreak = await this.calculateStreak(
        workoutPlan?.id,
        workoutPlan?.workoutDays,
        currentDate,
      );
    }

    return {
      activeWorkoutPlanId: workoutPlan?.id,
      todayWorkoutDay:
        todayWorkoutDay && workoutPlan
          ? {
              workoutPlanId: workoutPlan?.id,
              id: todayWorkoutDay.id,
              name: todayWorkoutDay.name,
              isRest: todayWorkoutDay.isRest,
              weekDay: todayWorkoutDay.weekDay,
              estimatedDurationInSeconds:
                todayWorkoutDay.estimatedDurationInSeconds,
              coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
              exercisesCount: todayWorkoutDay.exercises.length,
            }
          : undefined,
      workoutStreak,
      consistencyByDay,
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
