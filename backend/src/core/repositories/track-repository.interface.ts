/**
 * Persistence record contract for Track entity.
 * Minimal abstraction for Person 1 PostgreSQL / Prisma integration.
 */
export interface TrackRecord {
  id: string;
  eventId?: string;
  name: string;
  description?: string;
  createdAt?: Date;
}

/**
 * Track repository interface seam.
 * Allows Project Management to verify track existence and event association.
 */
export interface TrackRepository {
  findById(id: string): Promise<TrackRecord | null>;
  findByEventId?(eventId: string): Promise<TrackRecord[]>;
}
