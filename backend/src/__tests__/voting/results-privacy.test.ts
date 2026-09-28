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

async function createTestCommunityVote(prisma: PrismaClient, eventId: string, projectId: string, voterIdentity: string, voterType: string, points: number) {
  const id = randomUUID();
  return prisma.communityVote.create({
    data: {
      id,
      eventId,
      projectId,
      voterIdentity,
      voterType: voterType as any,
      points
    }
  });
}

describe('Tier 3 Phase 2F - Results Privacy', () => {
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

  async function createSetup(opts: { 
    startsAt?: Date, 
    endsAt?: Date, 
    mode?: string, 
    published?: boolean 
  }) {
    const org = await createTestUser(prisma, { role: 'ORGANIZER' });
    const admin = await createTestUser(prisma, { role: 'ADMIN' });
    const participant = await createTestUser(prisma, { role: 'PARTICIPANT' });
    const judge = await createTestUser(prisma, { role: 'JUDGE' });
    const publicUser = await createTestUser(prisma, { role: 'VISITOR' });

    const event = await createTestEvent(prisma, {
      votingMode: opts.mode || 'AUTHENTICATED',
      votingStartsAt: opts.startsAt,
      votingEndsAt: opts.endsAt,
      isResultsPublished: opts.published ?? false,
      maxVotesPerVoter: 1,
      organizerId: org.id
    });

    const team = await createTestTeam(prisma, event.id, 'Team A');
    const project = await createTestProject(prisma, team.id, 'Track 1', {
      status: PROJECT_STATUS.SUBMITTED
    });

    await createTestCommunityVote(prisma, event.id, project.id, 'voter1', 'AUTHENTICATED', 1);
    await createTestCommunityVote(prisma, event.id, project.id, 'voter2', 'AUTHENTICATED', 1);

    return { event, org, admin, participant, judge, publicUser, project };
  }

  async function login(userId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `${userId}@test.com`, password: 'password' },
    });
    const setCookie = res.headers['set-cookie'];
    return Array.isArray(setCookie) ? setCookie[0].split(';')[0] : (setCookie as string).split(';')[0];
  }

  describe('ACTIVE VOTING', () => {
    let setup: any;
    let tokens: any = {};

    before(async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 100000);
      const future = new Date(now.getTime() + 100000);
      setup = await createSetup({ startsAt: past, endsAt: future, published: true });
      tokens.org = await login(setup.org.id);
      tokens.admin = await login(setup.admin.id);
      tokens.participant = await login(setup.participant.id);
      tokens.judge = await login(setup.judge.id);
      tokens.public = await login(setup.publicUser.id);
    });

    it('1. organizer can view results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.org }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().data.results.length, 1);
    });

    it('2. admin can view results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.admin }
      });
      assert.strictEqual(res.statusCode, 200);
    });

    it('3. participant denied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.participant }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('4. judge denied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.judge }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('5. unauthenticated denied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('6. invalid session denied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: 'session=invalid' }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('7. publication=true does NOT expose results during active voting', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.participant }
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('POST-VOTING / UNPUBLISHED', () => {
    let setup: any;
    let tokens: any = {};

    before(async () => {
      const now = new Date();
      const past1 = new Date(now.getTime() - 200000);
      const past2 = new Date(now.getTime() - 100000);
      setup = await createSetup({ startsAt: past1, endsAt: past2, published: false });
      tokens.org = await login(setup.org.id);
      tokens.admin = await login(setup.admin.id);
      tokens.participant = await login(setup.participant.id);
    });

    it('8. organizer can view', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.org }
      });
      assert.strictEqual(res.statusCode, 200);
    });

    it('10. participant denied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`,
        headers: { cookie: tokens.participant }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('13. isResultsPublished=false blocks public results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('POST-VOTING / PUBLISHED', () => {
    let setup: any;
    let tokens: any = {};

    before(async () => {
      const now = new Date();
      const past1 = new Date(now.getTime() - 200000);
      const past2 = new Date(now.getTime() - 100000);
      setup = await createSetup({ startsAt: past1, endsAt: past2, published: true });
      tokens.org = await login(setup.org.id);
      tokens.participant = await login(setup.participant.id);
    });

    it('16. public can view if published and voting closed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().data.results.length, 1);
      assert.strictEqual(res.json().data.results[0].totalVotes, 2);
    });

    it('39. public response contains only intended result DTO (no voters/secrets)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup.event.id}/results`
      });
      const data = res.json().data;
      assert.ok(data.eventId !== undefined);
      assert.strictEqual(data.isResultsPublished, true);
      assert.ok(data.results[0].projectId !== undefined);
      assert.ok(data.results[0].title !== undefined);
      assert.ok(data.results[0].totalVotes !== undefined);
      assert.strictEqual(data.results[0].voterIdentity, undefined);
      assert.strictEqual(data.results[0].userId, undefined);
    });
  });

  describe('DISABLED', () => {
    let setup1: any, setup2: any;
    before(async () => {
      setup1 = await createSetup({ mode: 'DISABLED', published: false });
      setup2 = await createSetup({ mode: 'DISABLED', published: true });
    });

    it('27. votingMode=DISABLED with unpublished results (denies public)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup1.event.id}/results`
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('28. votingMode=DISABLED with published results (allows public)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${setup2.event.id}/results`
      });
      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe('EVENT ISOLATION', () => {
    it('19. Event A results cannot be retrieved as Event B', async () => {
      const past = new Date(Date.now() - 100000);
      const ev1 = await createSetup({ startsAt: past, endsAt: past, published: true });
      const ev2 = await createSetup({ startsAt: past, endsAt: past, published: true });
      
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${ev2.event.id}/results`
      });
      const results = res.json().data.results;
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].projectId, ev2.project.id);
    });

    it('20. nonexistent event handled safely', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${randomUUID()}/results`
      });
      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('PUBLICATION MUTATION', () => {
    let setup: any;
    let tokens: any = {};

    before(async () => {
      setup = await createSetup({ published: false });
      tokens.org = await login(setup.org.id);
      tokens.participant = await login(setup.participant.id);
    });

    it('29. organizer can publish', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/voting/events/${setup.event.id}/config`,
        headers: { cookie: tokens.org },
        payload: { isResultsPublished: true }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().data.isResultsPublished, true);
    });

    it('32. participant cannot publish', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/voting/events/${setup.event.id}/config`,
        headers: { cookie: tokens.participant },
        payload: { isResultsPublished: true }
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });
});
