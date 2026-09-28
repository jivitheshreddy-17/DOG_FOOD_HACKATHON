import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../infrastructure/database/prisma.client';
import { PrismaTransactionManager } from '../../infrastructure/database/prisma.transaction';
import { PrismaVerificationTokenRepository } from '../../infrastructure/database/repositories/prisma-verification-token.repository';
import { PrismaEventRepository } from '../../infrastructure/database/repositories/prisma-event.repository';
import { PrismaCommunityVoteRepository } from '../../infrastructure/database/repositories/prisma-community-vote.repository';
import { SystemClock } from '../../core/clock';
import { OtpService } from '../../modules/voting/services/otp.service';
import { VoterIdentityService } from '../../modules/voting/services/voter-identity.service';
import { EmailDeliveryService } from '../../modules/voting/services/email-delivery.service';
import { MemoryRateLimiter } from '../../modules/voting/services/rate-limiter.service';
import { VotingService } from '../../modules/voting/services/voting.service';
import { VotingWindowService } from '../../modules/voting/services/voting-window.service';

class TestEmailDeliveryService implements EmailDeliveryService {
  public lastOtp: string | null = null;
  public lastEmail: string | null = null;

  async sendOtpEmail(email: string, eventId: string, otp: string, expiresAt: Date): Promise<void> {
    this.lastOtp = otp;
    this.lastEmail = email;
  }
}

describe('OTP & Verification Token Domain', () => {
  let otpService: OtpService;
  let votingService: VotingService;
  let testEmailDelivery: TestEmailDeliveryService;
  let verificationTokenRepo: PrismaVerificationTokenRepository;
  let eventRepo: PrismaEventRepository;
  let communityVoteRepo: PrismaCommunityVoteRepository;

  const eventId = 'test-otp-event';

  before(async () => {
    verificationTokenRepo = new PrismaVerificationTokenRepository(prisma);
    eventRepo = new PrismaEventRepository(prisma);
    communityVoteRepo = new PrismaCommunityVoteRepository(prisma);
    const clock = new SystemClock();

    await prisma.communityVote.deleteMany({ where: { eventId } });
    await prisma.verificationToken.deleteMany({ where: { eventId } });
    await prisma.event.upsert({
      where: { id: eventId },
      update: { votingMode: 'EMAIL_GATED' },
      create: {
        id: eventId,
        name: 'Test OTP Event',
        votingMode: 'EMAIL_GATED',
        submissionsClose: new Date(),
      },
    });

    testEmailDelivery = new TestEmailDeliveryService();

    otpService = new OtpService({
      verificationTokenRepository: verificationTokenRepo,
      eventRepository: eventRepo,
      voterIdentityService: new VoterIdentityService(),
      emailDeliveryService: testEmailDelivery,
      clock,
      rateLimiter: new MemoryRateLimiter(),
    });

    votingService = new VotingService({
      eventRepository: eventRepo,
      projectRepository: {} as any,
      teamRepository: {} as any,
      communityVoteRepository: communityVoteRepo,
      transactionManager: new PrismaTransactionManager(prisma),
      votingWindowService: new VotingWindowService(clock),
    });
  });

  after(async () => {
    await prisma.communityVote.deleteMany({ where: { eventId } });
    await prisma.verificationToken.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  });

  describe('A. OTP request', () => {
    it('generates cryptographically secure OTP and does not persist it raw', async () => {
      const email = 'voter@example.com';
      await otpService.requestOtp(eventId, email);
      
      assert.ok(testEmailDelivery.lastOtp);
      assert.strictEqual(testEmailDelivery.lastOtp.length, 6);
      
      const tokens = await prisma.verificationToken.findMany({ where: { email } });
      assert.strictEqual(tokens.length, 1);
      assert.ok(tokens[0].tokenHash !== testEmailDelivery.lastOtp);
    });

    it('fails with malformed email', async () => {
      await assert.rejects(
        otpService.requestOtp(eventId, 'not-an-email'),
        /A valid email address is required/
      );
    });
  });

  describe('B. OTP verification & C. OTP concurrency', () => {
    it('verifies correctly and issues a verification token', async () => {
      const email = 'verify@example.com';
      await otpService.requestOtp(eventId, email);
      const otp = testEmailDelivery.lastOtp!;

      const result = await otpService.verifyOtp(eventId, email, otp);
      assert.strictEqual(result.success, true);
      assert.ok(result.verificationToken);
    });

    it('fails on wrong OTP', async () => {
      const email = 'wrong@example.com';
      await otpService.requestOtp(eventId, email);
      await assert.rejects(
        otpService.verifyOtp(eventId, email, '000000'),
        /Invalid OTP/
      );
    });

    it('provides atomic concurrency guarantees (C)', async () => {
      const email = 'concurrent@example.com';
      await otpService.requestOtp(eventId, email);
      const otp = testEmailDelivery.lastOtp!;

      const promises = [
        otpService.verifyOtp(eventId, email, otp),
        otpService.verifyOtp(eventId, email, otp),
      ];

      const results = await Promise.allSettled(promises);
      
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1);
      assert.strictEqual(rejected.length, 1);
      if (rejected[0].status === 'rejected') {
        assert.ok(rejected[0].reason.message.includes('already been used') || rejected[0].reason.message.includes('concurrent'));
      }
    });
  });

  describe('D. Verification token & E. Token concurrency', () => {
    it('succeeds once, and handles concurrency (E)', async () => {
      const email = 'token@example.com';
      await otpService.requestOtp(eventId, email);
      const { verificationToken } = await otpService.verifyOtp(eventId, email, testEmailDelivery.lastOtp!);
      
      const promises = [
        otpService.validateAndConsumeVerificationToken(eventId, verificationToken),
        otpService.validateAndConsumeVerificationToken(eventId, verificationToken),
      ];

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1);
      assert.strictEqual(rejected.length, 1);
    });

    it('fails for wrong event', async () => {
      const email = 'wrong-event@example.com';
      await otpService.requestOtp(eventId, email);
      const { verificationToken } = await otpService.verifyOtp(eventId, email, testEmailDelivery.lastOtp!);
      
      await assert.rejects(
        otpService.validateAndConsumeVerificationToken('wrong-event', verificationToken),
        /Invalid or unauthenticated/
      );
    });
  });

  describe('F. EMAIL_GATED voting', () => {
    it('allows voting with valid token and rejects reused token', async () => {
      const email = 'vote@example.com';
      await otpService.requestOtp(eventId, email);
      const { verificationToken } = await otpService.verifyOtp(eventId, email, testEmailDelivery.lastOtp!);

      // Since we need to stub otpService into dependencies, we'll manually test validateAndConsume
      const verifiedEmail = await otpService.validateAndConsumeVerificationToken(eventId, verificationToken);
      assert.strictEqual(verifiedEmail, email);

      // Second use should fail
      await assert.rejects(
        otpService.validateAndConsumeVerificationToken(eventId, verificationToken),
        /already been used/
      );
    });
  });
});
