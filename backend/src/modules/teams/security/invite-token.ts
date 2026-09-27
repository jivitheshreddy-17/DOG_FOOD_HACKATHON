import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a high-entropy, cryptographically secure random team invitation token.
 *
 * Security Properties:
 * - 32 bytes of secure random bytes yields 256 bits of entropy.
 * - Encoded as a 43-character URL-safe base64url string.
 * - Cannot be predicted, enumerated, or brute-forced.
 *
 * @param byteLength Number of random bytes (default: 32)
 * @returns Base64url encoded string
 */
export function generateInviteToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a deterministic, one-way SHA-256 digest of an invitation token
 * for persistence and repository lookup.
 *
 * Security Properties:
 * - Persistent storage maintains only `inviteTokenHash`.
 * - Database leaks do not expose usable invitation secrets.
 * - Exact-match lookups remain O(1) / indexed sub-millisecond fast.
 *
 * @param token The raw invitation secret
 * @returns 64-character lowercase hex string
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
