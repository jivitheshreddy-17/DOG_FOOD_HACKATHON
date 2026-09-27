import { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '@hackathon/contracts';
import { AppError } from '../errors';
import { SESSION_COOKIE_NAME } from './cookie';

export interface SessionResolver {
  resolveSession(token: string): Promise<AuthenticatedUser>;
}

/**
 * Safely parses cookie header into a key-value dictionary.
 * Prevents cookie ambiguity attacks by accepting only the first occurrence of each cookie name.
 * Tolerates malformed URI encodings without crashing.
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    // Prevent duplicate cookie ambiguity: first occurrence wins
    if (key.length > 0 && !(key in cookies)) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }

  return cookies;
}

/**
 * Extracts a session token from an incoming HTTP request.
 * Prioritizes the HTTP session cookie (the primary browser transport).
 * Supports standard Bearer authorization header for API and automated testing.
 * Strictly ignores query parameters and URL paths to prevent credential leakage.
 */
export function extractSessionToken(request: FastifyRequest): string | null {
  // 1. Session Cookie (Primary transport)
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader === 'string' && cookieHeader.length > 0) {
    const cookies = parseCookies(cookieHeader);
    const sessionCookie = cookies[SESSION_COOKIE_NAME];
    if (typeof sessionCookie === 'string' && sessionCookie.trim().length > 0) {
      return sessionCookie.trim();
    }
  }

  // 2. Authorization: Bearer <token> (Secondary/API test transport)
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  return null;
}

/**
 * Authentication request hook.
 *
 * Behavior:
 * - Anonymous request (no credential provided): sets `request.auth = undefined`.
 * - Valid credential: resolves session and sets `request.auth = AuthenticatedUser`.
 * - Invalid or expired credential: sets `request.auth = undefined` and captures `request.authError`.
 *
 * Crucial Design Guarantees:
 * - Does NOT reject with 401 directly, preserving public and anonymous routes (e.g. GET /health).
 * - Distinguishes between anonymous requests and requests presenting invalid credentials via `request.authError`.
 * - Authorization (requireAuth/requireRole) is deferred to Phase 3 guards.
 */
export async function authenticateRequest(
  request: FastifyRequest,
  resolver: SessionResolver
): Promise<void> {
  const token = extractSessionToken(request);

  if (!token) {
    request.auth = undefined;
    return;
  }

  try {
    const user = await resolver.resolveSession(token);
    request.auth = user;
  } catch (err) {
    request.auth = undefined;
    if (err instanceof AppError) {
      request.authError = err;
    }
  }
}
