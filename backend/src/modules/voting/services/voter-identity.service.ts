import { createHash, createHmac } from 'node:crypto';
import { AuthenticatedUser } from '../../../contracts';
import { UnauthorizedError, InvalidVotingModeError } from '../../../core/errors';

export class VoterIdentityService {
  private readonly hmacSecret: string;

  constructor(secret?: string) {
    this.hmacSecret = secret ?? process.env.VOTING_HMAC_SECRET ?? 'dogfood-2026-voter-secret';
  }

  deriveAuthenticatedIdentity(user: AuthenticatedUser | undefined): string {
    if (!user || !user.id) {
      throw new UnauthorizedError('Authentication required for AUTHENTICATED voting mode');
    }
    return user.id;
  }

  deriveEmailIdentity(verifiedEmail: string): string {
    if (!verifiedEmail || typeof verifiedEmail !== 'string' || verifiedEmail.trim().length === 0) {
      throw new InvalidVotingModeError('Verified email is required for EMAIL_GATED voting mode');
    }
    const normalized = verifiedEmail.trim().toLowerCase();
    return createHash('sha256').update(`email:${normalized}`).digest('hex');
  }

  /**
   * Derives a deterministic server-side HMAC fingerprint for OPEN_LINK voting mode.
   *
   * SECURITY & PRIVACY NOTE:
   * 1. This is an abuse-prevention signal only to deter naive repeat voting.
   * 2. It is NOT proof that "one human = one voter" (IPs/UserAgents can be shared or rotated).
   * 3. The raw IP and UserAgent are NEVER persisted in plain text in the database.
   */
  deriveOpenLinkIdentity(ip: string, userAgent: string): string {
    const normalizedIp = (ip ?? '127.0.0.1').trim().toLowerCase();
    const normalizedUa = (userAgent ?? 'unknown-ua').trim().toLowerCase();
    const payload = `${normalizedIp}:${normalizedUa}`;
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }
}
