import { PrismaTransactionClient } from '../prisma.client';
import {
  TrackRepository,
  TrackRecord,
} from '../../../core/repositories';

export class PrismaTrackRepository implements TrackRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findById(id: string): Promise<TrackRecord | null> {
    const track = await this.prisma.track.findUnique({
      where: { id }
    });
    if (!track) return null;
    return this.mapToDomain(track);
  }

  async findByEventId(eventId: string): Promise<TrackRecord[]> {
    const tracks = await this.prisma.track.findMany({
      where: { eventId }
    });
    return tracks.map(t => this.mapToDomain(t));
  }

  private mapToDomain(track: any): TrackRecord {
    return {
      id: track.id,
      eventId: track.eventId,
      name: track.name,
      description: undefined,
      createdAt: undefined,
    };
  }
}
