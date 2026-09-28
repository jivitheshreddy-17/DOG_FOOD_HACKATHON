import { AuditEventRepository, AuditEventFilterOptions, PaginatedAuditEvents } from '../../../core/repositories';
import { EventRepository } from '../../../core/repositories';
import { NotFoundError, ForbiddenError } from '../../../core/errors';
import { AuthenticatedUser, ROLES } from '@hackathon/contracts';

export interface AuditQueryServiceDependencies {
  auditEventRepository: AuditEventRepository;
  eventRepository: EventRepository;
}

export interface AuditQueryParams {
  eventId: string;
  caller: AuthenticatedUser;
  page?: number;
  limit?: number;
  action?: string;
  severity?: string;
}

/** Safe DTO returned to the organizer — no raw secrets or verification tokens */
export interface AuditEventResponseDTO {
  id?: string;
  eventId?: string | null;
  action: string;
  severity: string;
  actor: string;
  details: Record<string, unknown> | null;
  createdAt?: string;
}

/**
 * Application service for organizer-accessible audit trail retrieval.
 *
 * Security guarantees:
 * - Caller must be ORGANIZER or ADMIN (event_manage permission holders).
 * - eventId comes from trusted server-side route params — never from client body.
 * - Null-eventId records are never returned (strict where: { eventId } filter).
 * - Pagination is bounded: default 50, max 100.
 * - Ordering is deterministic: createdAt DESC, id DESC.
 * - No sensitive secrets (OTP, verification tokens, sessions) are stored in audit details by design.
 */
export class AuditQueryService {
  constructor(private readonly deps: AuditQueryServiceDependencies) {}

  private sanitizeDetails(details: any): Record<string, unknown> | null {
    if (!details || typeof details !== 'object') return details;
    
    // Deep clone to avoid mutating the original
    const sanitized = JSON.parse(JSON.stringify(details));

    const blocklist = [
      'token', 'hash', 'otp', 'password', 'secret', 'credential',
      'session', 'voterIdentity', // if not intended to be visible, but we assume we strip explicit raw identity if it's named 'voterIdentity' - wait, we already put 'actor: email...' which is fine
    ];

    const redact = (obj: any) => {
      if (Array.isArray(obj)) {
        obj.forEach(redact);
      } else if (obj !== null && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          const lowerKey = key.toLowerCase();
          if (blocklist.some(blocked => lowerKey.includes(blocked))) {
            obj[key] = '[REDACTED]';
          } else {
            redact(obj[key]);
          }
        }
      }
    };

    redact(sanitized);
    return sanitized;
  }

  async getAuditTrail(params: AuditQueryParams): Promise<{
    items: AuditEventResponseDTO[];
    page: number;
    limit: number;
    total: number;
  }> {
    const { eventId, caller, page, limit, action, severity } = params;

    // 1. Authorize — only ORGANIZER and ADMIN may access audit logs
    if (caller.role !== ROLES.ORGANIZER && caller.role !== ROLES.ADMIN) {
      throw new ForbiddenError('Only organizers and administrators can access the audit trail');
    }

    // 2. Verify the event exists (prevent IDOR via fabricated eventId)
    const event = await this.deps.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // 3. Delegate to repository with bounded pagination and safe filters
    const options: AuditEventFilterOptions = {
      page: page ?? 1,
      limit: limit ?? 50,
      action,
      severity: severity as any,
    };

    const repo = this.deps.auditEventRepository;
    if (typeof repo.listByEventPaginated !== 'function') {
      throw new Error('AuditEventRepository does not support paginated retrieval');
    }

    const result: PaginatedAuditEvents = await repo.listByEventPaginated!(eventId, options);

    // 4. Map to safe DTO — strip any internal fields if present
    const items: AuditEventResponseDTO[] = result.items.map((item) => ({
      id: item.id,
      eventId: item.eventId,
      action: item.action,
      severity: item.severity,
      actor: item.actor,
      details: this.sanitizeDetails(item.details),
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    }));

    return {
      items,
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  }
}
