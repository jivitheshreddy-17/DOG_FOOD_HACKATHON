import { PrismaClient } from '@prisma/client';
import { RubricDto } from '@hackathon/contracts';
import { RubricRepository } from '../../../core/repositories';

export class PrismaRubricRepository implements RubricRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<RubricDto | null> {
    const rubric = await this.prisma.rubric.findUnique({
      where: { id },
      include: { criteria: true },
    });

    if (!rubric) return null;

    return {
      id: rubric.id,
      eventId: rubric.eventId,
      name: rubric.name,
      criteria: rubric.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        order: c.order,
      })),
    };
  }

  async findByEventId(eventId: string): Promise<RubricDto | null> {
    const rubric = await this.prisma.rubric.findUnique({
      where: { eventId },
      include: { criteria: true },
    });

    if (!rubric) return null;

    return {
      id: rubric.id,
      eventId: rubric.eventId,
      name: rubric.name,
      criteria: rubric.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        order: c.order,
      })),
    };
  }

  async save(rubric: RubricDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Enforce Rubric Freeze Rule
      const activeAssignmentsCount = await tx.judgeAssignment.count({
        where: {
          eventId: rubric.eventId,
          status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        },
      });
      const scoresCount = await tx.score.count({
        where: { rubricId: rubric.id },
      });

      if (activeAssignmentsCount > 0 || scoresCount > 0) {
        throw new Error('Conflict: Rubric is frozen and cannot be mutated');
      }

      await tx.rubric.upsert({
        where: { id: rubric.id },
        create: {
          id: rubric.id,
          eventId: rubric.eventId,
          name: rubric.name,
        },
        update: {
          eventId: rubric.eventId,
          name: rubric.name,
        },
      });

      await tx.rubricCriterion.deleteMany({ where: { rubricId: rubric.id } });
      if (rubric.criteria.length > 0) {
        await tx.rubricCriterion.createMany({
          data: rubric.criteria.map((c: any) => ({
            id: c.id,
            rubricId: rubric.id,
            name: c.name,
            description: c.description,
            weight: c.weight,
            order: c.order,
          })),
        });
      }
    });
  }
}
