/**
 * Persistence record contract for Event entity.
 * Minimal abstraction for Person 1 PostgreSQL / Prisma integration.
 */
export interface EventRecord {
  id: string;
  name?: string;
  submissionDeadline?: Date | null;
  createdAt?: Date;
}

/**
 * Event repository interface seam.
 * Allows Phase 4 Team Management to verify event existence.
 */
export interface EventRepository {
  findById(id: string): Promise<EventRecord | null>;
}
