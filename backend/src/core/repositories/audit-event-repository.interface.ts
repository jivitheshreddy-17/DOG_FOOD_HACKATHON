import { AuditSeverity } from '@prisma/client';

export interface AuditEventDTO {
  id?: string;
  eventId?: string | null;
  action: string;
  severity: AuditSeverity;
  actor: string;
  details: any;
  createdAt?: Date;
}

export interface AuditEventFilterOptions {
  page?: number;
  limit?: number;
  action?: string;
  severity?: AuditSeverity;
}

export interface PaginatedAuditEvents {
  items: AuditEventDTO[];
  page: number;
  limit: number;
  total: number;
}

export interface AuditEventRepository {
  create(data: AuditEventDTO): Promise<AuditEventDTO>;
  listByEvent(eventId: string): Promise<AuditEventDTO[]>;
  listBySeverity(severity: AuditSeverity): Promise<AuditEventDTO[]>;
  listByEventPaginated?(eventId: string, options: AuditEventFilterOptions): Promise<PaginatedAuditEvents>;
}
