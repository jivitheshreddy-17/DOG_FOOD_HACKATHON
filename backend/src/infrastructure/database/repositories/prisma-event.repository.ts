import { PrismaTransactionClient } from '../prisma.client';
import {
  EventRepository,
  EventRecord,
} from '../../../core/repositories';

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findById(id: string): Promise<EventRecord | null> {
    const event = await this.prisma.event.findUnique({
      where: { id }
    });
    if (!event) return null;
    return this.mapToDomain(event);
  }

  async updateVotingConfig(id: string, updates: Partial<EventRecord>): Promise<EventRecord> {
    const data: any = {};
    if (updates.votingMode !== undefined) data.votingMode = updates.votingMode;
    if (updates.votingStartsAt !== undefined) data.votingStartsAt = updates.votingStartsAt;
    if (updates.votingEndsAt !== undefined) data.votingEndsAt = updates.votingEndsAt;
    if (updates.isResultsPublished !== undefined) data.isResultsPublished = updates.isResultsPublished;
    if (updates.maxVotesPerVoter !== undefined) data.maxVotesPerVoter = updates.maxVotesPerVoter;

    const event = await this.prisma.event.update({
      where: { id },
      data,
    });
    return this.mapToDomain(event);
  }

  private mapToDomain(event: any): EventRecord {
    return {
      id: event.id,
      name: event.name,
      submissionDeadline: event.submissionsClose,
      votingMode: event.votingMode,
      votingStartsAt: event.votingStartsAt,
      votingEndsAt: event.votingEndsAt,
      isResultsPublished: event.isResultsPublished,
      maxVotesPerVoter: event.maxVotesPerVoter,
      organizerId: event.organizerId,
      createdAt: event.createdAt,
    };
  }
}
