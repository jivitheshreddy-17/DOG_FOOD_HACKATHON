import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CommunityVoteRepository, CommunityVoteDTO } from '../../../core/repositories';

export class PrismaCommunityVoteRepository implements CommunityVoteRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async lockVoterForEvent(eventId: string, voterIdentity: string): Promise<() => void> {
    // Generate two 32-bit integers for the lock key from the eventId and voterIdentity
    const hash = createHash('sha256').update(`${eventId}:${voterIdentity}`).digest();
    const key1 = hash.readInt32LE(0);
    const key2 = hash.readInt32LE(4);

    // Acquire transaction-scoped advisory lock
    // It will automatically release when the transaction commits or rolls back
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(${key1}::integer, ${key2}::integer)`;

    // Return a no-op unlock function since the lock is transaction-scoped
    return () => {};
  }

  async create(data: CommunityVoteDTO): Promise<CommunityVoteDTO> {
    return this.prisma.communityVote.create({
      data: {
        id: data.id,
        eventId: data.eventId,
        projectId: data.projectId,
        voterIdentity: data.voterIdentity,
        voterType: data.voterType,
        userId: data.userId,
        points: data.points,
        createdAt: data.createdAt,
      },
    });
  }

  async findByUnique(eventId: string, voterIdentity: string, projectId: string): Promise<CommunityVoteDTO | null> {
    return this.prisma.communityVote.findUnique({
      where: {
        eventId_voterIdentity_projectId: {
          eventId,
          voterIdentity,
          projectId,
        },
      },
    });
  }

  async countByVoter(eventId: string, voterIdentity: string): Promise<number> {
    return this.prisma.communityVote.count({
      where: {
        eventId,
        voterIdentity,
      },
    });
  }

  async countByProject(eventId: string, projectId: string): Promise<number> {
    return this.prisma.communityVote.count({
      where: {
        eventId,
        projectId,
      },
    });
  }

  async getEventVoteTotals(eventId: string): Promise<{ projectId: string; totalVotes: number }[]> {
    const results = await this.prisma.communityVote.groupBy({
      by: ['projectId'],
      where: { eventId },
      _count: {
        id: true,
      },
    });
    return results.map((r) => ({
      projectId: r.projectId,
      totalVotes: r._count.id,
    }));
  }

  async listByEvent(eventId: string): Promise<CommunityVoteDTO[]> {
    return this.prisma.communityVote.findMany({
      where: { eventId },
    });
  }
}
