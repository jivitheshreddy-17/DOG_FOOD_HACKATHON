import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../prisma.client';
import { PrismaCommunityVoteRepository } from '../repositories/prisma-community-vote.repository';
import { PrismaProjectCommentRepository } from '../repositories/prisma-project-comment.repository';
import { PrismaVerificationTokenRepository } from '../repositories/prisma-verification-token.repository';
import { PrismaAuditEventRepository } from '../repositories/prisma-audit-event.repository';
import { PrismaTransactionManager } from '../prisma.transaction';

describe('Tier 3 Repositories', () => {
  let eventId = 'test-evt-t3';
  let projectId = 'test-proj-t3';

  before(async () => {
    await prisma.event.upsert({
      where: { id: eventId },
      update: {},
      create: { id: eventId, name: 'T3 Event', submissionsClose: new Date() }
    });
    await prisma.track.upsert({
      where: { id: 'test-track-t3' },
      update: {},
      create: { id: 'test-track-t3', name: 'T3 Track', eventId }
    });
    await prisma.team.upsert({
      where: { id: 'test-team-t3' },
      update: {},
      create: { id: 'test-team-t3', name: 'T3 Team', eventId }
    });
    await prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: { id: projectId, title: 'T3 Proj', summary: '', repoUrl: '', submittedAt: new Date(), teamId: 'test-team-t3', trackId: 'test-track-t3' }
    });
  });

  after(async () => {
    await prisma.communityVote.deleteMany({ where: { eventId } });
    await prisma.projectComment.deleteMany({ where: { projectId } });
    await prisma.verificationToken.deleteMany({ where: { eventId } });
    await prisma.auditEvent.deleteMany({ where: { eventId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.team.delete({ where: { id: 'test-team-t3' } });
    await prisma.track.delete({ where: { id: 'test-track-t3' } });
    await prisma.event.delete({ where: { id: eventId } });
  });

  describe('CommunityVote', () => {
    const repo = new PrismaCommunityVoteRepository(prisma);

    it('creates vote and rejects duplicate', async () => {
      await repo.create({
        eventId,
        projectId,
        voterIdentity: 'voter-1',
        voterType: 'AUTHENTICATED'
      });
      
      const count = await repo.countByVoter(eventId, 'voter-1');
      assert.strictEqual(count, 1);

      try {
        await repo.create({
          eventId,
          projectId,
          voterIdentity: 'voter-1',
          voterType: 'AUTHENTICATED'
        });
        assert.fail('Should reject duplicate');
      } catch (err: any) {
        assert.ok(err.message.includes('Unique constraint failed'));
      }
    });
  });

  describe('ProjectComment', () => {
    const repo = new PrismaProjectCommentRepository(prisma);
    it('creates and lists comments', async () => {
      await repo.create({
        projectId,
        authorName: 'John',
        content: 'Cool'
      });
      const { comments: list } = await repo.listByProject(projectId);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].authorName, 'John');
    });
  });

  describe('VerificationToken', () => {
    const repo = new PrismaVerificationTokenRepository(prisma);
    it('handles atomic consume correctly', async () => {
      await repo.create({
        email: 'test@test.com',
        tokenHash: 'hash1',
        eventId,
        expiresAt: new Date(Date.now() + 100000)
      });

      const first = await repo.consumeToken('hash1');
      assert.strictEqual(first, true);

      const second = await repo.consumeToken('hash1');
      assert.strictEqual(second, false, 'Second consume should fail');
    });
  });

  describe('AuditEvent', () => {
    const repo = new PrismaAuditEventRepository(prisma);
    it('creates and filters by event', async () => {
      await repo.create({
        eventId,
        action: 'TEST_ACTION',
        severity: 'INFO',
        actor: 'system',
        details: {}
      });
      const list = await repo.listByEvent(eventId);
      assert.strictEqual(list.length, 1);
    });
  });

  describe('Transaction Manager', () => {
    it('rolls back T3 repo changes', async () => {
      const tm = new PrismaTransactionManager(prisma);
      try {
        await tm.run(async (repos) => {
          await repos.projectCommentRepository!.create({
            projectId,
            authorName: 'Tx',
            content: 'Roll me back'
          });
          throw new Error('Tx err');
        });
        assert.fail('Should throw');
      } catch (e: any) {
        assert.strictEqual(e.message, 'Tx err');
      }

      const list = await prisma.projectComment.findMany({ where: { authorName: 'Tx' } });
      assert.strictEqual(list.length, 0);
    });
  });
});
