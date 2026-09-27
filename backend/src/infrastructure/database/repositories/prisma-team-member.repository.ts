import { PrismaTransactionClient } from '../prisma.client';
import {
  TeamMemberRepository,
  TeamMemberRecord,
  CreateTeamMemberDto
} from '../../../core/repositories';

export class PrismaTeamMemberRepository implements TeamMemberRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findByTeamAndUser(teamId: string, userId: string): Promise<TeamMemberRecord | null> {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: { team: true },
    });
    if (!member) return null;
    return this.mapToDomain(member);
  }

  async findByEventAndUser(eventId: string, userId: string): Promise<TeamMemberRecord | null> {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        team: { eventId },
      },
      include: { team: true },
    });
    if (!member) return null;
    return this.mapToDomain(member);
  }

  async countByTeam(teamId: string): Promise<number> {
    return this.prisma.teamMember.count({
      where: { teamId }
    });
  }

  async findByTeamId(teamId: string): Promise<TeamMemberRecord[]> {
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: { team: true },
    });
    return members.map(m => this.mapToDomain(m));
  }

  async create(data: CreateTeamMemberDto): Promise<TeamMemberRecord> {
    // We ignore data.id, data.eventId for persistence as per Prisma schema.
    const member = await this.prisma.teamMember.create({
      data: {
        teamId: data.teamId,
        userId: data.userId,
      },
      include: { team: true },
    });
    return this.mapToDomain(member);
  }

  private mapToDomain(member: any): TeamMemberRecord {
    return {
      id: `${member.teamId}_${member.userId}`,
      teamId: member.teamId,
      userId: member.userId,
      eventId: member.team.eventId,
      createdAt: undefined as any,
    };
  }
}
