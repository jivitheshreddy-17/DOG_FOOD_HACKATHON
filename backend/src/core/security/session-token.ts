import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a high-entropy, cryptographically secure random session bearer token.
 *
 * @param byteLength Number of random bytes (default: 32 bytes = 256 bits of entropy)
 * @returns URL-safe, cookie-safe base64url encoded string
 */
export function generateSessionToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a deterministic, one-way cryptographic SHA-256 digest of a session token
 * for persistence and repository lookup.
 *
 * Security Properties:
 * - The raw bearer token has 256 bits of entropy and cannot be rainbow-tabled or brute-forced.
 * - Persistent storage stores only `tokenHash`, ensuring database exposure does not yield usable bearer credentials.
 * - Exact-match lookups (`WHERE token_hash = $1`) remain sub-millisecond fast.
 *
 * @param token The raw bearer session token
 * @returns 64-character lowercase hex string
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
