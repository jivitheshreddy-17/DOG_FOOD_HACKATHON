import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRole, Permission } from '@hackathon/contracts';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { hasPermission, hasAnyPermission } from './policy';

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
