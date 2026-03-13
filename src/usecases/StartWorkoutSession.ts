import { SessionAlreadyStartedError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

export interface OutputDto {
  userWorkoutSessionId: string;
}

export class StartWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
    });

    if (!workoutPlan) {
      throw new Error("Workout plan not found");
    }

    if (workoutPlan.userId !== dto.userId) {
      throw new Error("Workout plan not found");
    }

    if (!workoutPlan.isActive) {
      throw new Error("Workout plan is not active");
    }

    const workoutDay = await prisma.workoutDay.findUnique({
      where: { id: dto.workoutDayId, workoutPlanId: dto.workoutPlanId },
    });

    if (!workoutDay) {
      throw new Error("Workout day not found");
    }

    const existingSession = await prisma.workoutSession.findFirst({
      where: { workoutDayId: dto.workoutDayId },
    });

    if (existingSession) {
      throw new SessionAlreadyStartedError(
        "A session has already been started for this day",
      );
    }

    const session = await prisma.workoutSession.create({
      data: {
        workoutDayId: dto.workoutDayId,
        startedAt: new Date(),
      },
    });

    return {
      userWorkoutSessionId: session.id,
    };
  }
}
