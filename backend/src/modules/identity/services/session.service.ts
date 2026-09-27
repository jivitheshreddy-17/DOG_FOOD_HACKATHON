import { AuthenticatedUser } from '@hackathon/contracts';
import { SessionRepository, UserRepository } from '../../../core/repositories';
import { Clock } from '../../../core/clock';
import { generateSessionToken, hashSessionToken, SessionResolver } from '../../../core/security';
import { UnauthorizedError, InvalidSessionError } from '../../../core/errors';
import { toAuthenticatedUser } from '../../../core/types/mappers';

export interface SessionServiceDeps {
  sessionRepository: SessionRepository;
  userRepository: UserRepository;
  clock: Clock;
  sessionTtlSeconds: number;
}

export interface SessionCredential {
  /** Raw bearer token returned strictly to internal caller for transport delivery */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Server-side session management service.
 *
 * Responsibilities:
 * - Generates high-entropy cryptographic bearer tokens.
 * - Stores only one-way cryptographic digests (SHA-256) of tokens in persistent storage.
 * - Determines session expiration deterministically using the injected Clock abstraction.
 * - Enforces exact expiration boundary: active when now < expiresAt; expired when now >= expiresAt.
 * - Resolves active sessions to sanitized AuthenticatedUser identities.
 * - Invalidates sessions on logout without affecting other concurrent sessions for the same user.
 */
export class SessionService implements SessionResolver {
  constructor(private readonly deps: SessionServiceDeps) {}

  /**
   * Creates a new server-side session for an authenticated user.
   * Persists the token's cryptographic hash, never the raw bearer credential.
   */
  async createSession(user: AuthenticatedUser): Promise<SessionCredential> {
    if (!user || !user.id || typeof user.id !== 'string') {
      throw new UnauthorizedError('User identity required to create session');
    }

    // Verify user exists in repository
    const existingUser = await this.deps.userRepository.findById(user.id);
    if (!existingUser) {
      throw new UnauthorizedError('User does not exist');
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.sessionTtlSeconds * 1000);

    const record = await this.deps.sessionRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      token,
      sessionId: record.id,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Resolves a raw bearer token to an AuthenticatedUser identity.
   *
   * Enforces:
   * 1. Token exists and hashes to an existing session record.
   * 2. Session has not expired (now < expiresAt).
   * 3. Associated user account still exists in the user repository.
   */
  async resolveSession(rawToken: string): Promise<AuthenticatedUser> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new InvalidSessionError('Session is invalid or expired');
    }

    const tokenHash = hashSessionToken(rawToken);
    const session = await this.deps.sessionRepository.findByTokenHash(tokenHash);

    if (!session) {
      throw new InvalidSessionError('Session is invalid or expired');
    }

    const now = this.deps.clock.now();
    if (now.getTime() >= session.expiresAt.getTime()) {
      throw new InvalidSessionError('Session is invalid or expired');
    }

    const user = await this.deps.userRepository.findById(session.userId);
    if (!user) {
      throw new InvalidSessionError('Session is invalid or expired');
    }

    return toAuthenticatedUser(user);
  }

  /**
   * Invalidates a session by its raw bearer token.
   * Idempotent: does not throw if the session does not exist.
   */
  async invalidateSession(rawToken: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return;
    }

    const tokenHash = hashSessionToken(rawToken);
    await this.deps.sessionRepository.deleteByTokenHash(tokenHash);
  }

  /**
   * Invalidates a session by its internal session ID.
   */
  async invalidateSessionById(sessionId: string): Promise<void> {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return;
    }

    await this.deps.sessionRepository.delete(sessionId);
  }
}
