export const SESSION_COOKIE_NAME = 'session';

export interface CookieSerializationOptions {
  name?: string;
  maxAgeSeconds?: number;
  isProduction?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

/**
 * Serializes an active session token into an RFC 6265 compliant Set-Cookie header string.
 *
 * Security Attributes:
 * - `HttpOnly`: Prevents client-side scripts from reading the cookie (mitigating XSS theft).
 * - `SameSite=Lax`: Mitigates CSRF for cross-site POST requests while permitting top-level navigation.
 * - `Path=/`: Restricts cookie scope to the entire domain.
 * - `Secure`: Enforced in production to ensure transmission only over encrypted HTTPS.
 * - `Max-Age`: Set explicitly to match server-side session TTL.
 */
export function serializeSessionCookie(
  token: string,
  options: {
    name?: string;
    maxAgeSeconds: number;
    isProduction: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    path?: string;
  }
): string {
  const name = options.name ?? SESSION_COOKIE_NAME;
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const secure = options.isProduction ? '; Secure' : '';

  return `${name}=${encodeURIComponent(token)}; Path=${path}; Max-Age=${options.maxAgeSeconds}; HttpOnly; SameSite=${sameSite}${secure}`;
}

/**
 * Serializes a cookie clearing directive for logout.
 * Uses identical Name, Path, SameSite, and Secure flags with an expired date and Max-Age=0.
 */
export function serializeClearSessionCookie(options: {
  name?: string;
  isProduction: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}): string {
  const name = options.name ?? SESSION_COOKIE_NAME;
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const secure = options.isProduction ? '; Secure' : '';

  return `${name}=; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=${sameSite}${secure}`;
}
