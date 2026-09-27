import { AuthenticatedUser } from '@hackathon/contracts';
import { AppDependencies } from '../application/dependencies';
import { Config } from '../config';
import { AppError } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Authenticated identity attached to the request.
     * Set by authentication middleware when a valid session credential is presented.
     * Undefined for anonymous visitors.
     */
    auth?: AuthenticatedUser;

    /**
     * Captured authentication failure error when a credential was presented but was invalid or expired.
     * Allows downstream authorization middleware (Phase 3) to produce descriptive 401 errors
     * while preserving anonymous access for public routes (e.g. GET /health).
     */
    authError?: AppError;
  }

  interface FastifyInstance {
    dependencies: AppDependencies;
    config?: Config;
  }
}

export interface RequestContext {
  requestId: string;
  auth?: AuthenticatedUser;
  authError?: AppError;
}
