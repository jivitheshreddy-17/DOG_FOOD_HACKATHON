import { PrismaTransactionClient } from '../prisma.client';
import {
  TeamRepository,
  TeamRecord,
  CreateTeamDto
} from '../../../core/repositories';
import { createHash } from 'node:crypto';

export class PrismaTeamRepository implements TeamRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findById(id: string): Promise<TeamRecord | null> {
    const team = await this.prisma.team.findUnique({
      where: { id }
    });
    if (!team) return null;
    return this.mapToDomain(team);
  }

  async findByInviteToken(token: string): Promise<TeamRecord | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.findByInviteTokenHash(tokenHash);
  }

  async findByInviteTokenHash(tokenHash: string): Promise<TeamRecord | null> {
    const team = await this.prisma.team.findUnique({
      where: { inviteTokenHash: tokenHash }
    });
    if (!team) return null;
    return this.mapToDomain(team);
  }

  async create(data: CreateTeamDto): Promise<TeamRecord> {
    let inviteTokenHash = data.inviteTokenHash;
    if (!inviteTokenHash && data.inviteToken) {
      inviteTokenHash = createHash('sha256').update(data.inviteToken).digest('hex');
    }

    const team = await this.prisma.team.create({
      data: {
        id: data.id!,
        name: data.name,
        eventId: data.eventId,
        inviteTokenHash: inviteTokenHash || undefined,
      }
    });
    return this.mapToDomain(team);
  }

  async update(id: string, data: Partial<Omit<TeamRecord, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TeamRecord> {
    let inviteTokenHash = data.inviteTokenHash;
    if (!inviteTokenHash && data.inviteToken) {
      inviteTokenHash = createHash('sha256').update(data.inviteToken).digest('hex');
    }

    const team = await this.prisma.team.update({
      where: { id },
      data: {
        name: data.name,
        eventId: data.eventId,
        ...(inviteTokenHash !== undefined && inviteTokenHash !== null ? { inviteTokenHash } : {}),
      }
    });
    return this.mapToDomain(team);
  }

  private mapToDomain(team: any): TeamRecord {
    return {
      id: team.id,
      eventId: team.eventId,
      name: team.name,
      inviteToken: undefined,
      inviteTokenHash: team.inviteTokenHash,
      createdAt: undefined as any,
      updatedAt: undefined as any,
    };
  }
}
