/**
 * Internal persistence record for an active session.
 *
 * Security Guarantee:
 * The `tokenHash` field stores a one-way cryptographic digest (SHA-256) of the bearer token.
 * Raw bearer tokens must NEVER be persisted in the database, preventing session hijacking
 * in the event of persistent storage compromise or database dumps.
 */
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateSessionDto {
  id?: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  findById(id: string): Promise<SessionRecord | null>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  create(data: CreateSessionDto): Promise<SessionRecord>;
  delete(id: string): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}
