import { PrismaClient } from '@prisma/client';
import { JudgeAssignmentDto } from '@hackathon/contracts';
import { JudgeAssignmentRepository } from '../../../core/repositories';

export class PrismaJudgeAssignmentRepository implements JudgeAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(assignment: JudgeAssignmentDto): Promise<void> {
    await this.prisma.judgeAssignment.create({
      data: {
        id: assignment.id,
        eventId: assignment.eventId,
        judgeId: assignment.judgeId,
        projectId: assignment.projectId,
        trackId: assignment.trackId,
        status: assignment.status,
      },
    });
  }

  async findById(id: string): Promise<JudgeAssignmentDto | null> {
    const assignment = await this.prisma.judgeAssignment.findUnique({
      where: { id },
    });
    return assignment ? this.mapToDto(assignment) : null;
  }

  async findByJudgeAndProject(judgeId: string, projectId: string): Promise<JudgeAssignmentDto | null> {
    const assignment = await this.prisma.judgeAssignment.findUnique({
      where: { judgeId_projectId: { judgeId, projectId } },
    });
    return assignment ? this.mapToDto(assignment) : null;
  }

  async findByJudge(judgeId: string): Promise<JudgeAssignmentDto[]> {
    const assignments = await this.prisma.judgeAssignment.findMany({
      where: { judgeId },
    });
    return assignments.map(this.mapToDto);
  }

  async findByEvent(eventId: string): Promise<JudgeAssignmentDto[]> {
    const assignments = await this.prisma.judgeAssignment.findMany({
      where: { eventId },
    });
    return assignments.map(this.mapToDto);
  }

  async findAll(): Promise<JudgeAssignmentDto[]> {
    const assignments = await this.prisma.judgeAssignment.findMany();
    return assignments.map(this.mapToDto);
  }

  async updateStatus(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'): Promise<void> {
    await this.prisma.judgeAssignment.update({
      where: { id },
      data: { status },
    });
  }

  async updateStatusWithOcc(
    id: string,
    expectedVersion: number,
    status: 'IN_PROGRESS' | 'COMPLETED'
  ): Promise<boolean> {
    const result = await this.prisma.judgeAssignment.updateMany({
      where: {
        id,
        version: expectedVersion,
        status: { not: 'COMPLETED' },
      },
      data: {
        status,
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async getProgressStats(filter: { eventId?: string; judgeId?: string }): Promise<{ trackId: string | null; judgeId: string; status: string; count: number; }[]> {
    const where: any = {};
    if (filter.eventId) where.eventId = filter.eventId;
    if (filter.judgeId) where.judgeId = filter.judgeId;

    const result = await this.prisma.judgeAssignment.groupBy({
      by: ['trackId', 'judgeId', 'status'],
      where,
      _count: true,
    });

    return result.map(r => ({
      trackId: r.trackId,
      judgeId: r.judgeId,
      status: r.status,
      count: r._count,
    }));
  }

  private mapToDto(assignment: any): JudgeAssignmentDto {
    return {
      id: assignment.id,
      eventId: assignment.eventId,
      judgeId: assignment.judgeId,
      projectId: assignment.projectId,
      trackId: assignment.trackId,
      status: assignment.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
      version: assignment.version ?? 1,
    };
  }
}
