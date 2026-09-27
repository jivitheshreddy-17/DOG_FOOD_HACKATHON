import { PrismaClient, NormalizationRun, NormalizedResult } from '@prisma/client';
import { NormalizationRepository, CreateNormalizationRunParams } from '../../../core/repositories';

export class PrismaNormalizationRepository implements NormalizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createRun(params: CreateNormalizationRunParams): Promise<NormalizationRun> {
    const { results, ...runData } = params;

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.normalizationRun.create({
        data: {
          ...runData,
          results: {
            createMany: {
              data: results as any
            }
          }
        },
      });

      return run;
    });
  }

  async findRunById(id: string): Promise<NormalizationRun | null> {
    return this.prisma.normalizationRun.findUnique({
      where: { id },
    });
  }

  async findRunsByEvent(eventId: string): Promise<NormalizationRun[]> {
    return this.prisma.normalizationRun.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findResultsByRun(runId: string): Promise<NormalizedResult[]> {
    return this.prisma.normalizedResult.findMany({
      where: { normalizationRunId: runId },
    });
  }
}
