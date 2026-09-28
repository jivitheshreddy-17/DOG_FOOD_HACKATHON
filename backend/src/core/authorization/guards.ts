import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRole, Permission, ROLES } from '@hackathon/contracts';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import { hasPermission, hasAnyPermission } from './policy';
import { EventRepository } from '../repositories/event-repository.interface';

export type AuthorizationGuard = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

/**
 * Asserts that the request carries a valid authenticated identity.
 *
 * Evaluation:
 * 1. If an authentication failure occurred (e.g. invalid or expired session),
 *    re-throws request.authError (HTTP 401 INVALID_SESSION).
 * 2. If no credentials were provided at all,
 *    throws UnauthorizedError('Authentication required') (HTTP 401 UNAUTHORIZED).
 * 3. If request.auth exists, execution proceeds without querying the database again.
 */
export function requireAuth(): AuthorizationGuard {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.authError) {
      throw request.authError;
    }

    if (!request.auth) {
      throw new UnauthorizedError('Authentication required');
    }
  };
}

/**
 * Asserts that the request is authenticated AND the user possesses one of the allowed roles.
 *
 * Evaluation:
 * 1. Evaluates authentication first (throws 401 if unauthenticated or invalid session).
 * 2. Compares request.auth.role against allowed roles:
 *    - If role matches, execution proceeds.
 *    - If role does not match, throws ForbiddenError (HTTP 403 FORBIDDEN).
 */
export function requireRole(...allowedRoles: AuthenticatedRole[]): AuthorizationGuard {
  const allowedSet = new Set(allowedRoles);

  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.authError) {
      throw request.authError;
    }

    if (!request.auth) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedSet.has(request.auth.role)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
  };
}

/**
 * Asserts that the request is authenticated AND the user's role grants the required permission
 * according to the centralized authorization policy.
 *
 * Evaluation:
 * 1. Evaluates authentication first (throws 401 if unauthenticated or invalid session).
 * 2. Evaluates permission via policy:
 *    - If granted, execution proceeds.
 *    - If not granted, throws ForbiddenError (HTTP 403 FORBIDDEN).
 */
export function requirePermission(permission: Permission): AuthorizationGuard {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.authError) {
      throw request.authError;
    }

    if (!request.auth) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasPermission(request.auth.role, permission)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
  };
}

/**
 * Asserts that the request is authenticated AND the user's role grants at least one
 * of the specified permissions.
 */
export function requireAnyPermission(...permissions: Permission[]): AuthorizationGuard {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.authError) {
      throw request.authError;
    }

    if (!request.auth) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasAnyPermission(request.auth.role, permissions)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
  };
}

/**
 * Asserts that the requested event is explicitly owned by the authenticated ORGANIZER.
 * 
 * Rules:
 * 1. Requires authentication.
 * 2. Fetches the event to verify it exists.
 * 3. If ADMIN, bypasses ownership check.
 * 4. If ORGANIZER, checks if event.organizerId === request.auth.id.
 * 5. Other roles are not checked (they are assumed blocked by standard RBAC unless explicitly allowed).
 */
export function requireEventOwnership(
  getEventId: (req: FastifyRequest) => string | Promise<string>,
  eventRepository: EventRepository
): AuthorizationGuard {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.authError) {
      throw request.authError;
    }

    if (!request.auth) {
      throw new UnauthorizedError('Authentication required');
    }

    const eventId = await getEventId(request);
    const event = await eventRepository.findById(eventId);
    if (!event) {
      // Don't leak event existence if not authorized; we use 404 since it's standard 
      // when the event is requested but not found or they can't access it.
      // Or throw 403. Based on requirements, use project conventions. 
      throw new NotFoundError('Event not found');
    }

    if (request.auth.role === ROLES.ADMIN) {
      return; // Admin bypass
    }

    if (request.auth.role === ROLES.ORGANIZER) {
      if (event.organizerId !== request.auth.id) {
        throw new ForbiddenError('You do not have permission to perform this action');
      }
    }
  };
}
