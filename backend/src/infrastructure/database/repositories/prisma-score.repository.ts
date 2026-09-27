import { PrismaClient } from '@prisma/client';
import { ScoreCriterionInput, ScoreResponseDto } from '@hackathon/contracts';
import { ScoreRepository } from '../../../core/repositories';

export class PrismaScoreRepository implements ScoreRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAssignmentId(assignmentId: string): Promise<ScoreResponseDto | null> {
    const score = await this.prisma.score.findUnique({
      where: { assignmentId },
      include: { criteria: true, assignment: true },
    });
    if (!score) return null;
    return this.mapToDto(score);
  }

  async upsert(params: {
    assignmentId: string;
    judgeId: string;
    projectId: string;
    rubricId: string;
    criteria: ScoreCriterionInput[];
    comment: string;
    submittedAt: Date | null;
  }): Promise<ScoreResponseDto> {
    const { assignmentId, judgeId, projectId, rubricId, criteria, comment, submittedAt } = params;

    // Upsert score header
    const score = await this.prisma.score.upsert({
      where: { assignmentId },
      create: {
        assignmentId,
        judgeId,
        projectId,
        rubricId,
        comment,
        submittedAt,
      },
      update: {
        comment,
        submittedAt,
        updatedAt: new Date(),
      },
    });

    // Replace criterion observations atomically
    await this.prisma.scoreCriterion.deleteMany({ where: { scoreId: score.id } });
    if (criteria.length > 0) {
      await this.prisma.scoreCriterion.createMany({
        data: criteria.map((c) => ({
          scoreId: score.id,
          criterionId: c.criterionId,
          value: c.value,
        })),
      });
    }

    // Fetch the freshly written rows to build the response
    const fresh = await this.prisma.score.findUniqueOrThrow({
      where: { id: score.id },
      include: { criteria: true, assignment: true },
    });

    return this.mapToDto(fresh);
  }

  private mapToDto(score: any): ScoreResponseDto {
    return {
      id: score.id,
      assignmentId: score.assignmentId,
      projectId: score.projectId,
      status: score.assignment?.status ?? 'PENDING',
      criteria: (score.criteria ?? []).map((c: any) => ({
        criterionId: c.criterionId,
        value: c.value,
      })),
      comment: score.comment ?? '',
      submittedAt: score.submittedAt ? score.submittedAt.toISOString() : null,
      updatedAt: score.updatedAt.toISOString(),
    };
  }
}
