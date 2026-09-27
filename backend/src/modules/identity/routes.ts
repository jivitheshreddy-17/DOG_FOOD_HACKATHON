import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginRequestSchema, LoginRequest } from '@hackathon/contracts';
import { validateRequest } from '../../core/validation';
import { successResponse } from '../../core/responses';
import {
  serializeSessionCookie,
  serializeClearSessionCookie,
  extractSessionToken,
} from '../../core/security';
import { requireAuth } from '../../core/authorization';

/**
 * Identity and Authentication route definitions:
 * - POST /api/auth/login  - Validates credentials, creates server session, sets session cookie
 * - POST /api/auth/logout - Invalidates current session, clears session cookie
 * - GET  /api/auth/me     - Returns authenticated user identity from request context
 */
export async function identityRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post(
    '/api/auth/login',
    {
      preHandler: validateRequest({ body: loginRequestSchema }),
    },
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      // 1. Verify credentials via AuthenticationService
      const user = await app.dependencies.authenticationService.authenticate(
        email,
        password
      );

      // 2. Create server-side session (persists tokenHash, returns raw token)
      const credential = await app.dependencies.sessionService.createSession(user);

      // 3. Issue secure session cookie
      const sessionCookie = serializeSessionCookie(credential.token, {
        maxAgeSeconds: app.config?.sessionTtlSeconds ?? 604800,
        isProduction: app.config?.isProduction ?? false,
      });
      reply.header('Set-Cookie', sessionCookie);

      // 4. Return sanitized public identity envelope (no secrets, no raw tokens)
      return reply.status(200).send(
        successResponse({
          user: {
            id: user.id,
            role: user.role,
          },
        })
      );
    }
  );

  // POST /api/auth/logout
  app.post(
    '/api/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Extract current token (if any) and invalidate matching session
      const token = extractSessionToken(request);
      if (token) {
        await app.dependencies.sessionService.invalidateSession(token);
      }

      // 2. Issue cookie clearing header (matching Name, Path, SameSite, and Secure)
      const clearCookie = serializeClearSessionCookie({
        isProduction: app.config?.isProduction ?? false,
      });
      reply.header('Set-Cookie', clearCookie);

      // 3. Return idempotent success response
      return reply.status(200).send(
        successResponse({
          success: true,
        })
      );
    }
  );

  // GET /api/auth/me
  app.get(
    '/api/auth/me',
    {
      preHandler: requireAuth(),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Return current authenticated user identity
      return reply.status(200).send(
        successResponse({
          user: {
            id: request.auth!.id,
            role: request.auth!.role,
          },
        })
      );
    }
  );
}
