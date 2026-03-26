import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

interface OutputDto {
  userId: string;
  userName: string;
  weightInGrams: number;
  heightInCm: number;
  age: number;
  bodyFatPercentage: number;
  mainGoal: string;
}

export class GetUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto | null> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      return null;
    }

    if (
      user.weightInGrams === null ||
      user.heightInCm === null ||
      user.age === null ||
      user.bodyFatPercentage === null ||
      user.mainGoal === null
    ) {
      return null;
    }

    return {
      userId: user.id,
      userName: user.name,
      weightInGrams: user.weightInGrams,
      heightInCm: user.heightInCm,
      age: user.age,
      bodyFatPercentage: user.bodyFatPercentage,
      mainGoal: user.mainGoal,
    };
  }
}
