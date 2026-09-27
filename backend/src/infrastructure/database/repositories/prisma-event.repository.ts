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

  private mapToDomain(event: any): EventRecord {
    return {
      id: event.id,
      name: event.name,
      submissionDeadline: event.submissionsClose,
      createdAt: undefined,
    };
  }
}
