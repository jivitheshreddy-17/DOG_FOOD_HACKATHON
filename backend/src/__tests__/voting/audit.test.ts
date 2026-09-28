import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../index';
import { randomUUID } from 'crypto';
import { ScryptPasswordHasher } from '../../core/security';

const hasher = new ScryptPasswordHasher();

async function createTestUser(prisma: PrismaClient, opts: { role: string }) {
  const id = randomUUID();
  const passwordHash = await hasher.hash('password');
  return prisma.user.create({
    data: {
      id,
      email: `${id}@test.com`,
      passwordHash,
      role: opts.role as any,
      name: `User ${id}`,
    }
  });
}

async function createTestEvent(prisma: PrismaClient, opts?: any) {
  const id = randomUUID();
  return prisma.event.create({
    data: {
      id,
      name: 'Event ' + id,
      submissionsClose: new Date(),
      ...opts
    }
  });
}

async function login(userId: string) {
  return `session=${userId}`; // Assuming simple mock login or we need to hit /api/auth/login
}
  describe('Tier 3 Phase 2H - Organizer Audit Trail', () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
  
    before(async () => {
      prisma = new PrismaClient();
      app = await buildServer();
    });
  
    after(async () => {
      await app.close();
      await prisma.$disconnect();
    });
  
    async function login(userId: string) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: `${userId}@test.com`, password: 'password' },
      });
      return res.headers['set-cookie'] as string;
    }

    async function createAudit(eventId: string | null, action: string, severity: string, details: any = {}) {
    return await prisma.auditEvent.create({
      data: {
        eventId,
        action,
        severity: severity as any,
        actor: 'test-actor',
        details,
      },
    });
  }

  describe('Authorization & RBAC', () => {
    it('1. Organizer can read audit for authorized event', async () => {
      const organizer = await createTestUser(prisma, { role: 'ORGANIZER' });
      const event = await createTestEvent(prisma, { organizerId: organizer.id });
      const token = await login(organizer.id);

      await createAudit(event.id, 'TEST_ACTION', 'INFO');

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      assert.strictEqual(res.statusCode, 200);
      const data = res.json().data;
      assert.ok(Array.isArray(data.items));
      assert.strictEqual(data.items.length, 1);
    });

    it('2. Admin can read audit', async () => {
      const admin = await createTestUser(prisma, { role: 'ADMIN' });
      const event = await createTestEvent(prisma);
      const token = await login(admin.id);

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      assert.strictEqual(res.statusCode, 200);
    });

    it('3. Judge receives 403', async () => {
      const judge = await createTestUser(prisma, { role: 'JUDGE' });
      const event = await createTestEvent(prisma);
      const token = await login(judge.id);

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('4. Participant receives 403', async () => {
      const participant = await createTestUser(prisma, { role: 'PARTICIPANT' });
      const event = await createTestEvent(prisma);
      const token = await login(participant.id);

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('5. Anonymous user receives 401', async () => {
      const event = await createTestEvent(prisma);

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
      });

      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('Event Isolation & Security', () => {
    it('6. Event A request cannot read Event B audit (IDOR)', async () => {
      const organizer = await createTestUser(prisma, { role: 'ORGANIZER' });
      const eventA = await createTestEvent(prisma, { organizerId: organizer.id });
      const eventB = await createTestEvent(prisma, { organizerId: organizer.id });
      const token = await login(organizer.id);

      await createAudit(eventB.id, 'ACTION_B', 'INFO');

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${eventA.id}/audit`,
        headers: { cookie: token },
      });

      assert.strictEqual(res.statusCode, 200);
      const data = res.json().data;
      assert.strictEqual(data.items.length, 0, 'Should not see Event B audits');
    });

    it('7. Null-event records are excluded', async () => {
      const organizer = await createTestUser(prisma, { role: 'ORGANIZER' });
      const event = await createTestEvent(prisma, { organizerId: organizer.id });
      const token = await login(organizer.id);

      await createAudit(null, 'GLOBAL_ACTION', 'INFO');

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      const data = res.json().data;
      assert.strictEqual(data.items.length, 0);
    });

    it('8. Secret safety: sensitive fields are redacted', async () => {
      const organizer = await createTestUser(prisma, { role: 'ORGANIZER' });
      const event = await createTestEvent(prisma, { organizerId: organizer.id });
      const token = await login(organizer.id);

      await createAudit(event.id, 'OTP_REQUEST', 'INFO', {
        otp: '123456',
        sessionToken: 'xyz',
        verificationTokenHash: 'abc',
        safeData: 'visible',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit`,
        headers: { cookie: token },
      });

      const items = res.json().data.items;
      assert.strictEqual(items.length, 1);
      const details = items[0].details;
      
      assert.strictEqual(details.otp, '[REDACTED]');
      assert.strictEqual(details.sessionToken, '[REDACTED]');
      assert.strictEqual(details.verificationTokenHash, '[REDACTED]');
      assert.strictEqual(details.safeData, 'visible');
    });
  });

  describe('Pagination & Filtering', () => {
    it('9. Pagination with deterministic ordering', async () => {
      const admin = await createTestUser(prisma, { role: 'ADMIN' });
      const event = await createTestEvent(prisma);
      const token = await login(admin.id);

      // Create 3 records, oldest first
      await createAudit(event.id, 'ACT1', 'INFO');
      await createAudit(event.id, 'ACT2', 'INFO');
      await createAudit(event.id, 'ACT3', 'INFO');

      // Page 1, limit 2
      const res1 = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit?page=1&limit=2`,
        headers: { cookie: token },
      });

      const data1 = res1.json().data;
      assert.strictEqual(data1.items.length, 2);
      assert.strictEqual(data1.items[0].action, 'ACT3'); // Newest first
      assert.strictEqual(data1.items[1].action, 'ACT2');

      // Page 2, limit 2
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit?page=2&limit=2`,
        headers: { cookie: token },
      });

      const data2 = res2.json().data;
      assert.strictEqual(data2.items.length, 1);
      assert.strictEqual(data2.items[0].action, 'ACT1');
    });

    it('10. Filtering by action and severity', async () => {
      const admin = await createTestUser(prisma, { role: 'ADMIN' });
      const event = await createTestEvent(prisma);
      const token = await login(admin.id);

      await createAudit(event.id, 'TARGET_ACTION', 'WARNING');
      await createAudit(event.id, 'TARGET_ACTION', 'INFO');
      await createAudit(event.id, 'OTHER_ACTION', 'WARNING');

      // Filter by action
      const resA = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit?action=TARGET_ACTION`,
        headers: { cookie: token },
      });
      assert.strictEqual(resA.json().data.items.length, 2);

      // Filter by severity
      const resS = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit?severity=WARNING`,
        headers: { cookie: token },
      });
      assert.strictEqual(resS.json().data.items.length, 2);

      // Combined
      const resC = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${event.id}/audit?action=TARGET_ACTION&severity=WARNING`,
        headers: { cookie: token },
      });
      assert.strictEqual(resC.json().data.items.length, 1);
    });
  });
});
