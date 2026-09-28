import { createHmac, randomInt, randomBytes } from 'node:crypto';
import {
  VerificationTokenRepository,
  EventRepository,
  AuditEventRepository,
} from '../../../core/repositories';
import { Clock } from '../../../core/clock';
import {
  NotFoundError,
  InvalidVotingModeError,
  InvalidOtpError,
  OtpExpiredError,
  OtpUsedError,
  ValidationError,
  AppError,
} from '../../../core/errors';
import { VoterIdentityService } from './voter-identity.service';
import { EmailDeliveryService } from './email-delivery.service';
import { MemoryRateLimiter } from './rate-limiter.service';

export class RateLimitExceededError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super('RATE_LIMIT_EXCEEDED', 429, message);
  }
}

export interface OtpServiceDependencies {
  verificationTokenRepository: VerificationTokenRepository;
  eventRepository: EventRepository;
  auditEventRepository?: AuditEventRepository;
  voterIdentityService: VoterIdentityService;
  emailDeliveryService: EmailDeliveryService;
  clock: Clock;
  secret?: string;
  rateLimiter?: MemoryRateLimiter;
}

export class OtpService {
  private readonly hmacSecret: string;
  private readonly rateLimiter: MemoryRateLimiter;

  constructor(private readonly dependencies: OtpServiceDependencies) {
    this.hmacSecret = dependencies.secret ?? process.env.VOTING_HMAC_SECRET ?? 'dogfood-2026-voter-secret';
    this.rateLimiter = dependencies.rateLimiter ?? new MemoryRateLimiter();
  }

  async requestOtp(eventId: string, rawEmail: string): Promise<{ success: boolean; devOtp?: string }> {
    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      throw new ValidationError('A valid email address is required');
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    
    // Rate limit: 3 requests per 15 minutes per email
    const rlKey = `otp_req:${eventId}:${normalizedEmail}`;
    if (!(await this.rateLimiter.checkLimit(rlKey, 3, 15 * 60 * 1000))) {
      throw new RateLimitExceededError();
    }

    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    if (event.votingMode !== 'EMAIL_GATED') {
      throw new InvalidVotingModeError(`Event '${eventId}' is not configured for EMAIL_GATED voting`);
    }

    const otp = randomInt(100000, 999999).toString();
    const tokenHash = this.computeOtpHash(eventId, normalizedEmail, otp);
    const now = this.dependencies.clock.now();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minute TTL

    await this.dependencies.verificationTokenRepository.create({
      email: normalizedEmail,
      tokenHash,
      eventId,
      expiresAt,
    });

    if (this.dependencies.auditEventRepository) {
      await this.dependencies.auditEventRepository.create({
        eventId,
        action: 'OTP_REQUESTED',
        severity: 'INFO',
        actor: `email:${normalizedEmail}`,
        details: { expiresAt: expiresAt.toISOString() }, // Don't log full email in details
      });
    }

    // Deliver email securely
    try {
      await this.dependencies.emailDeliveryService.sendOtpEmail(normalizedEmail, eventId, otp, expiresAt);
    } catch (e) {
      await this.dependencies.verificationTokenRepository.consumeToken(tokenHash);
      throw e;
    }

    const isDev = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_OTP === 'true';
    return {
      success: true,
      devOtp: isDev ? otp : undefined,
    };
  }

  async verifyOtp(
    eventId: string,
    rawEmail: string,
    rawOtp: string
  ): Promise<{ success: boolean; verificationToken: string }> {
    if (!rawEmail || typeof rawEmail !== 'string') {
      throw new ValidationError('Email is required');
    }
    if (!rawOtp || typeof rawOtp !== 'string' || rawOtp.trim().length === 0) {
      throw new ValidationError('OTP is required');
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    const normalizedOtp = rawOtp.trim();
    
    // Rate limit: 5 attempts per 15 minutes per email
    const rlKey = `otp_ver:${eventId}:${normalizedEmail}`;
    if (!(await this.rateLimiter.checkLimit(rlKey, 5, 15 * 60 * 1000))) {
      throw new RateLimitExceededError();
    }

    const tokenHash = this.computeOtpHash(eventId, normalizedEmail, normalizedOtp);

    const token = await this.dependencies.verificationTokenRepository.findByTokenHash(tokenHash);
    const now = this.dependencies.clock.now();

    if (!token || token.eventId !== eventId) {
      if (this.dependencies.auditEventRepository) {
        await this.dependencies.auditEventRepository.create({
          eventId,
          action: 'OTP_VERIFY_FAILED',
          severity: 'WARNING',
          actor: `email:${normalizedEmail}`,
          details: { reason: 'INVALID_TOKEN' },
        });
      }
      throw new InvalidOtpError();
    }

    if (token.usedAt) {
      if (this.dependencies.auditEventRepository) {
        await this.dependencies.auditEventRepository.create({
          eventId,
          action: 'OTP_VERIFY_FAILED',
          severity: 'WARNING',
          actor: `email:${normalizedEmail}`,
          details: { reason: 'ALREADY_USED' },
        });
      }
      throw new OtpUsedError();
    }

    if (token.expiresAt < now) {
      if (this.dependencies.auditEventRepository) {
        await this.dependencies.auditEventRepository.create({
          eventId,
          action: 'OTP_VERIFY_FAILED',
          severity: 'WARNING',
          actor: `email:${normalizedEmail}`,
          details: { reason: 'EXPIRED' },
        });
      }
      throw new OtpExpiredError();
    }

    // Atomically mark raw OTP token as consumed
    const consumed = await this.dependencies.verificationTokenRepository.consumeToken(tokenHash);
    if (!consumed) {
      throw new OtpUsedError('Token was just used concurrently');
    }

    // Issue short-lived, single-use verification credential token
    const verificationToken = randomBytes(32).toString('hex');
    const sessionTokenHash = this.computeSessionTokenHash(verificationToken);
    const sessionExpiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min TTL

    await this.dependencies.verificationTokenRepository.create({
      email: normalizedEmail,
      tokenHash: sessionTokenHash,
      eventId,
      expiresAt: sessionExpiresAt,
    });

    if (this.dependencies.auditEventRepository) {
      await this.dependencies.auditEventRepository.create({
        eventId,
        action: 'OTP_VERIFIED',
        severity: 'INFO',
        actor: `email:${normalizedEmail}`,
        details: { tokenIssued: true },
      });
    }

    return {
      success: true,
      verificationToken,
    };
  }

  async validateAndConsumeVerificationToken(eventId: string, token: string): Promise<string> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new ValidationError('Verification token is required');
    }

    const sessionTokenHash = this.computeSessionTokenHash(token.trim());
    const tokenRecord = await this.dependencies.verificationTokenRepository.findByTokenHash(sessionTokenHash);
    const now = this.dependencies.clock.now();

    if (!tokenRecord || tokenRecord.eventId !== eventId) {
      throw new InvalidOtpError('Invalid or unauthenticated verification token for this event');
    }

    if (tokenRecord.usedAt) {
      throw new OtpUsedError('Verification token has already been used');
    }

    if (tokenRecord.expiresAt < now) {
      throw new OtpExpiredError('Verification token has expired');
    }

    // Atomically consume single-use token
    const consumed = await this.dependencies.verificationTokenRepository.consumeToken(sessionTokenHash);
    if (!consumed) {
      throw new OtpUsedError('Token was just used concurrently');
    }

    return tokenRecord.email;
  }

  private computeOtpHash(eventId: string, email: string, otp: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`otp:${eventId}:${email}:${otp}`)
      .digest('hex');
  }

  private computeSessionTokenHash(verificationToken: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`session:${verificationToken}`)
      .digest('hex');
  }
}
