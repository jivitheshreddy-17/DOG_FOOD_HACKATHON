import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { randomUUID } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.client';
import { OtpService } from '../../modules/voting/services/otp.service';
import { PrismaVerificationTokenRepository } from '../../infrastructure/database/repositories/prisma-verification-token.repository';
import { PrismaEventRepository } from '../../infrastructure/database/repositories/prisma-event.repository';
import { VoterIdentityService } from '../../modules/voting/services/voter-identity.service';
import { EmailDeliveryService } from '../../modules/voting/services/email-delivery.service';
import { MemoryRateLimiter } from '../../modules/voting/services/rate-limiter.service';

describe('Security - SMTP Failure Semantics', () => {
  let eventId = randomUUID();

  before(async () => {
    await prisma.event.create({ data: { id: eventId, name: 'T5', votingMode: 'EMAIL_GATED', submissionsClose: new Date() }});
  });

  after(async () => {
    await prisma.verificationToken.deleteMany({ where: { eventId }});
    await prisma.event.deleteMany({ where: { id: eventId }});
    await prisma.$disconnect();
  });

  test('Do not create usable state if SMTP fails', async () => {
    const deps = {
      verificationTokenRepository: new PrismaVerificationTokenRepository(prisma),
      eventRepository: new PrismaEventRepository(prisma),
      voterIdentityService: new VoterIdentityService(),
      emailDeliveryService: {
        sendOtpEmail: async () => { throw new Error('SMTP Error'); }
      } as any,
      clock: { now: () => new Date() },
      rateLimiter: new MemoryRateLimiter(),
    };
    const svc = new OtpService(deps);

    let failed = false;
    try {
      await svc.requestOtp(eventId, 'test@example.com');
    } catch (e: any) {
      assert.strictEqual(e.message, 'SMTP Error');
      failed = true;
    }
    assert.ok(failed, 'Should throw SMTP error');

    const tokens = await prisma.verificationToken.findMany({ where: { email: 'test@example.com', eventId }});
    // The token was written before the email was sent. 
    // It should either be rolled back, deleted, or consumed!
    if (tokens.length > 0) {
      assert.ok(tokens[0].usedAt !== null, 'If token exists after SMTP failure, it must be consumed/invalidated');
    }
  });
});
