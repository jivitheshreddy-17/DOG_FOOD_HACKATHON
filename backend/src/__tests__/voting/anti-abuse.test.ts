import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildServer } from '../../index';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { PROJECT_STATUS } from '@hackathon/contracts';
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

async function createTestEvent(prisma: PrismaClient, opts: any) {
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

async function createTestTeam(prisma: PrismaClient, eventId: string, name: string) {
  const id = randomUUID();
  return prisma.team.create({
    data: { id, eventId, name }
  });
}

async function createTestProject(prisma: PrismaClient, teamId: string, trackId: string, opts: any) {
  const id = randomUUID();
  await prisma.track.upsert({
    where: { id: trackId },
    update: {},
    create: { id: trackId, name: 'Track', eventId: (await prisma.team.findUnique({where: {id: teamId}}))!.eventId }
  });
  return prisma.project.create({
    data: {
      id,
      teamId,
      trackId,
      title: 'Project ' + id,
      summary: 'summary',
      repoUrl: 'url',
      submittedAt: new Date(),
      ...opts
    }
  });
}

describe('Tier 3 Phase 2G - Anti-Abuse / Voting Protection', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient();

  before(async () => {
    app = await buildServer();
    await app.ready();
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
    const setCookie = res.headers['set-cookie'];
    return Array.isArray(setCookie) ? setCookie[0].split(';')[0] : (setCookie as string).split(';')[0];
  }

  describe('RATE LIMITING & CONCURRENCY', () => {
    let setup: any;
    let tokens: any = {};

    before(async () => {
      const participant = await createTestUser(prisma, { role: 'PARTICIPANT' });
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      const future = new Date(now.getTime() + 100000);

      const event = await createTestEvent(prisma, {
        votingMode: 'AUTHENTICATED',
        votingStartsAt: past,
        votingEndsAt: future,
        maxVotesPerVoter: 5,
      });

      const team = await createTestTeam(prisma, event.id, 'Team A');
      const p1 = await createTestProject(prisma, team.id, 'Track 1', { status: PROJECT_STATUS.SUBMITTED });
      const p2 = await createTestProject(prisma, team.id, 'Track 1', { status: PROJECT_STATUS.SUBMITTED });

      setup = { event, participant, projects: [p1, p2] };
      tokens.participant = await login(participant.id);
    });

    it('14. same voter / same project concurrency (duplicate rejection)', async () => {
      const reqs = Array.from({ length: 3 }).map(() => app.inject({
        method: 'POST',
        url: `/api/voting/events/${setup.event.id}/votes`,
        headers: { cookie: tokens.participant },
        payload: { projectId: setup.projects[0].id }
      }));

      const responses = await Promise.all(reqs);
      const created = responses.filter(r => r.statusCode === 201);
      
      const duplicateErrors = responses.filter(r => {
          if(r.statusCode !== 400 && r.statusCode !== 409 && r.statusCode !== 403) return false;
          try {
            const body = JSON.parse(r.payload);
            return body.error && body.error.code === 'DUPLICATE_VOTE';
          } catch(e) { return false; }
      });

      assert.strictEqual(created.length, 1);
      assert.strictEqual(duplicateErrors.length, 2);
    });

    it('9. vote rate limit triggers', async () => {
      // 5 requests per minute allowed
      const participant2 = await createTestUser(prisma, { role: 'PARTICIPANT' });
      const token2 = await login(participant2.id);

      // Create 6 different projects
      const ps: any[] = [];
      for(let i=0; i<6; i++) {
        const team = await createTestTeam(prisma, setup.event.id, 'Team ' + i);
        ps.push(await createTestProject(prisma, team.id, 'Track ' + i, { status: PROJECT_STATUS.SUBMITTED }));
      }

      for (let i=0; i<5; i++) {
        const res: any = await app.inject({
          method: 'POST',
          url: `/api/voting/events/${setup.event.id}/votes`,
          headers: { cookie: token2 },
          payload: { projectId: ps[i].id }
        });
        assert.strictEqual(res.statusCode, 201);
      }

      // 6th request should hit rate limit (HTTP 429)
      const resRateLimit = await app.inject({
        method: 'POST',
        url: `/api/voting/events/${setup.event.id}/votes`,
        headers: { cookie: token2 },
        payload: { projectId: ps[5].id }
      });
      assert.strictEqual(resRateLimit.statusCode, 429);
      assert.strictEqual(resRateLimit.json().error.code, 'RATE_LIMIT_EXCEEDED');
    });
  });

  describe('CROSS-EVENT ISOLATION', () => {
    it('17. cross-event vote blocked', async () => {
      const ev1 = await createTestEvent(prisma, { votingMode: 'AUTHENTICATED', votingStartsAt: new Date(Date.now()-10000), votingEndsAt: new Date(Date.now()+10000) });
      const team1 = await createTestTeam(prisma, ev1.id, 'Team A');
      const p1 = await createTestProject(prisma, team1.id, 'Track 1', { status: PROJECT_STATUS.SUBMITTED });

      const ev2 = await createTestEvent(prisma, { votingMode: 'AUTHENTICATED', votingStartsAt: new Date(Date.now()-10000), votingEndsAt: new Date(Date.now()+10000) });

      const participant = await createTestUser(prisma, { role: 'PARTICIPANT' });
      const token = await login(participant.id);

      const res: any = await app.inject({
        method: 'POST',
        url: `/api/voting/events/${ev2.id}/votes`,
        headers: { cookie: token },
        payload: { projectId: p1.id }
      });
      // Project belongs to ev1, but we vote on ev2.
      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('OTP RATE LIMITS', () => {
      it('23. OTP request rate limit', async () => {
         const event = await createTestEvent(prisma, { votingMode: 'EMAIL_GATED', votingStartsAt: new Date(Date.now()-10000), votingEndsAt: new Date(Date.now()+10000) });
         const email = 'testrl@example.com';
         for(let i=0; i<3; i++) {
             const res: any = await app.inject({
                 method: 'POST',
                 url: `/api/voting/events/${event.id}/otp/request`,
                 payload: { email }
             });
             assert.strictEqual(res.statusCode, 200);
         }
         // 4th request rate limits
         const res4 = await app.inject({
             method: 'POST',
             url: `/api/voting/events/${event.id}/otp/request`,
             payload: { email }
         });
         assert.strictEqual(res4.statusCode, 429);
      });
  });

});
