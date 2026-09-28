import { PrismaClient, Prisma, AuditSeverity } from '@prisma/client';
import { AuditEventRepository, AuditEventDTO } from '../../../core/repositories';

export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async create(data: AuditEventDTO): Promise<AuditEventDTO> {
    return this.prisma.auditEvent.create({
      data: {
        id: data.id,
        eventId: data.eventId,
        action: data.action,
        severity: data.severity,
        actor: data.actor,
        details: data.details !== undefined ? (data.details as any) : Prisma.JsonNull,
        createdAt: data.createdAt,
      },
    });
  }

  async listByEvent(eventId: string): Promise<AuditEventDTO[]> {
    return this.prisma.auditEvent.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listBySeverity(severity: AuditSeverity): Promise<AuditEventDTO[]> {
    return this.prisma.auditEvent.findMany({
      where: { severity },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByEventPaginated(eventId: string, options: any): Promise<any> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = { eventId };
    if (options.action) {
      where.action = options.action;
    }
    if (options.severity) {
      where.severity = options.severity;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
    };
  }
}
