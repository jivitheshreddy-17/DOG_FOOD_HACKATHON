import { PrismaTransactionClient } from '../prisma.client';
import {
  SessionRepository,
  SessionRecord,
  CreateSessionDto
} from '../../../core/repositories';

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findById(id: string): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { id }
    });
    if (!session) return null;
    return this.mapToDomain(session);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash }
    });
    if (!session) return null;
    return this.mapToDomain(session);
  }

  async create(data: CreateSessionDto): Promise<SessionRecord> {
    const session = await this.prisma.session.create({
      data: {
        id: data.id,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      }
    });
    return this.mapToDomain(session);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { id }
    });
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash }
    });
  }

  private mapToDomain(session: any): SessionRecord {
    return {
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }
}
