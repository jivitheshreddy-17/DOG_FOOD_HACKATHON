import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../infrastructure/database/prisma.client';
import { resolveDependencies } from '../../core/application/dependencies';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../index';
import { PROJECT_STATUS } from '@hackathon/contracts';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dogfood:dogfood@localhost:5432/dogfood?schema=public';

describe('Tier 3 Phase 2E — Gallery and Comments Domain', () => {
  let app: FastifyInstance;
  const deps = resolveDependencies();
  
  const eventId = 'test-evt-gallery';
  const trackId = 'test-track-gallery';
  const teamId = 'test-team-gallery';
  const projectId = 'test-proj-gallery';
  const ineligibleProjectId = 'test-proj-ineligible';
  const otherEventId = 'test-evt-other';
  const otherTeamId = 'test-team-other';
  const otherProjectId = 'test-proj-other';

  before(async () => {
    app = await buildServer();

    // Seed Events
    await prisma.event.upsert({
      where: { id: eventId },
      update: {},
      create: { id: eventId, name: 'Gallery Event', submissionsClose: new Date() }
    });
    await prisma.event.upsert({
      where: { id: otherEventId },
      update: {},
      create: { id: otherEventId, name: 'Other Event', submissionsClose: new Date() }
    });

    // Seed Tracks
    await prisma.track.upsert({
      where: { id: trackId },
      update: {},
      create: { id: trackId, name: 'Gallery Track', eventId }
    });

    // Seed Teams
    await prisma.team.upsert({
      where: { id: teamId },
      update: {},
      create: { id: teamId, name: 'Gallery Team', eventId }
    });
    await prisma.team.upsert({
      where: { id: otherTeamId },
      update: {},
      create: { id: otherTeamId, name: 'Other Team', eventId: otherEventId }
    });

    // Seed Projects
    // 1. Eligible project (submitted)
    await prisma.project.upsert({
      where: { id: projectId },
      update: { status: PROJECT_STATUS.SUBMITTED },
      create: { 
        id: projectId, 
        title: 'Gallery Project', 
        summary: 'A cool project for gallery', 
        repoUrl: 'https://github.com/test/gallery', 
        status: PROJECT_STATUS.SUBMITTED,
        submittedAt: new Date(), 
        teamId, 
        trackId 
      }
    });

    // 2. Ineligible project (draft)
    await prisma.project.upsert({
      where: { id: ineligibleProjectId },
      update: { status: PROJECT_STATUS.DRAFT },
      create: { 
        id: ineligibleProjectId, 
        title: 'Draft Project', 
        summary: 'Not ready yet', 
        repoUrl: 'https://github.com/test/draft', 
        status: PROJECT_STATUS.DRAFT,
        submittedAt: new Date(),
        teamId, 
        trackId 
      }
    });

    // 3. Other event project (submitted)
    await prisma.project.upsert({
      where: { id: otherProjectId },
      update: { status: PROJECT_STATUS.SUBMITTED },
      create: { 
        id: otherProjectId, 
        title: 'Other Project', 
        summary: 'Different event project', 
        repoUrl: 'https://github.com/test/other', 
        status: PROJECT_STATUS.SUBMITTED,
        submittedAt: new Date(), 
        teamId: otherTeamId, 
        trackId
      }
    });
  });

  after(async () => {
    await prisma.projectComment.deleteMany({ where: { projectId: { in: [projectId, ineligibleProjectId, otherProjectId] } } });
    await prisma.auditEvent.deleteMany({ where: { eventId: { in: [eventId, otherEventId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectId, ineligibleProjectId, otherProjectId] } } });
    await prisma.team.deleteMany({ where: { id: { in: [teamId, otherTeamId] } } });
    await prisma.track.deleteMany({ where: { id: trackId } });
    await prisma.event.deleteMany({ where: { id: { in: [eventId, otherEventId] } } });
    await app.close();
  });

  describe('Gallery API', () => {
    it('returns only eligible submitted projects for the event', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${eventId}/projects`
      });

      assert.strictEqual(response.statusCode, 200);
      const data = response.json().data;
      assert.ok(Array.isArray(data.data));
      assert.strictEqual(data.data.length, 1);
      assert.strictEqual(data.data[0].id, projectId);
      assert.strictEqual(data.data[0].title, 'Gallery Project');
    });

    it('rejects gallery query for non-existent event', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/events/fake-event/projects`
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json().data.data.length, 0);
    });

    it('filters gallery by track and search', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${eventId}/projects?trackId=${trackId}&search=gallery`
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json().data.data.length, 1);

      const noMatchResponse = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${eventId}/projects?search=nomatch`
      });
      assert.strictEqual(noMatchResponse.json().data.data.length, 0);
    });

    it('returns project details for eligible project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/projects/${projectId}`
      });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json().data.id, projectId);
    });

    it('returns 404 for ineligible project detail', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/projects/${ineligibleProjectId}`
      });
      assert.strictEqual(response.statusCode, 404);
    });
  });

  describe('Comments API', () => {
    it('allows posting a comment to an eligible project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/voting/projects/${projectId}/comments`,
        payload: {
          content: 'This is a great project!',
          authorName: 'Test Reviewer'
        }
      });
      
      assert.strictEqual(response.statusCode, 201);
      const data = response.json().data;
      assert.strictEqual(data.content, 'This is a great project!');
      assert.strictEqual(data.authorName, 'Test Reviewer');
      assert.strictEqual(data.projectId, projectId);
    });

    it('sanitizes HTML from comments', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/voting/projects/${projectId}/comments`,
        payload: {
          content: '<script>alert(1)</script> Just text <b>bold</b>',
        }
      });
      
      assert.strictEqual(response.statusCode, 201);
      const data = response.json().data;
      assert.ok(!data.content.includes('<script>'));
      // The sanitization implementation strips tags completely and escapes remaining
      assert.strictEqual(data.content, 'alert(1) Just text bold');
      assert.strictEqual(data.authorName, 'Community Member');
    });

    it('rejects empty or whitespace-only comments', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/voting/projects/${projectId}/comments`,
        payload: { content: '   ' }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    it('rejects comments for ineligible projects', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/voting/projects/${ineligibleProjectId}/comments`,
        payload: { content: 'Nice draft!' }
      });
      
      assert.strictEqual(response.statusCode, 404);
    });

    it('fetches paginated comments for a project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/projects/${projectId}/comments?page=1&pageSize=10`
      });
      
      assert.strictEqual(response.statusCode, 200);
      const data = response.json().data;
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 2); // The two we just created
      assert.strictEqual(data.pagination.page, 1);
      assert.strictEqual(data.pagination.pageSize, 10);
      assert.ok(data.pagination.total >= 2);
    });
  });

  describe('Security and Auditing', () => {
    it('prevents IDOR across events', async () => {
      // Create a comment with eventId set in service layer logic directly
      // Or we just verify that getGallery for event A doesn't return project from event B
      const response = await app.inject({
        method: 'GET',
        url: `/api/voting/events/${eventId}/projects`
      });
      const data = response.json().data.data;
      const ids = data.map((p: any) => p.id);
      assert.ok(!ids.includes(otherProjectId));
    });

    it('creates an audit event tied to the trusted relational eventId', async () => {
      const audits = await prisma.auditEvent.findMany({
        where: { eventId, action: 'COMMENT_CREATED' }
      });
      assert.ok(audits.length >= 2);
      assert.strictEqual(audits[0].severity, 'INFO');
    });
  });
});
