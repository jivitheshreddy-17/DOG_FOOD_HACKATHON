import { PrismaClient, Prisma } from '@prisma/client';
import { VerificationTokenRepository, VerificationTokenDTO } from '../../../core/repositories';

export class PrismaVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async create(data: VerificationTokenDTO): Promise<VerificationTokenDTO> {
    return this.prisma.verificationToken.create({
      data: {
        id: data.id,
        email: data.email,
        tokenHash: data.tokenHash,
        eventId: data.eventId,
        expiresAt: data.expiresAt,
        usedAt: data.usedAt,
        createdAt: data.createdAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<VerificationTokenDTO | null> {
    return this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
  }

  async consumeToken(tokenHash: string): Promise<boolean> {
    const result = await this.prisma.verificationToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  async deleteByEvent(eventId: string): Promise<void> {
    await this.prisma.verificationToken.deleteMany({
      where: { eventId },
    });
  }
}
