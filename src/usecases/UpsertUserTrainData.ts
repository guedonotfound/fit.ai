import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  weightInGrams: number;
  heightInCm: number;
  age: number;
  bodyFatPercentage: number;
}

interface OutputDto {
  userId: string;
  weightInGrams: number;
  heightInCm: number;
  age: number;
  bodyFatPercentage: number;
  mainGoal: string;
}

export class UpsertUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const bodyFatPercentageInDb = Math.round(dto.bodyFatPercentage);

    const user = await prisma.user.update({
      where: { id: dto.userId },
      data: {
        weightInGrams: dto.weightInGrams,
        heightInCm: dto.heightInCm,
        age: dto.age,
        bodyFatPercentage: bodyFatPercentageInDb,
      },
    });

    return {
      userId: user.id,
      weightInGrams: user.weightInGrams!,
      heightInCm: user.heightInCm!,
      age: user.age!,
      bodyFatPercentage: user.bodyFatPercentage!,
      mainGoal: user.mainGoal!,
    };
  }
}
