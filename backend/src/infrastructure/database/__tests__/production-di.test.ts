import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildServer } from '../../../index';

describe('Production Dependency Wiring', () => {
  it('resolves all four T3 repositories to real Prisma implementations', async () => {
    const app = await buildServer();
    const repos = (app as any).dependencies.repositories;

    assert.ok(repos.communityVoteRepository, 'communityVoteRepository is missing');
    assert.strictEqual(
      repos.communityVoteRepository.constructor.name,
      'PrismaCommunityVoteRepository'
    );

    assert.ok(repos.projectCommentRepository, 'projectCommentRepository is missing');
    assert.strictEqual(
      repos.projectCommentRepository.constructor.name,
      'PrismaProjectCommentRepository'
    );

    assert.ok(repos.verificationTokenRepository, 'verificationTokenRepository is missing');
    assert.strictEqual(
      repos.verificationTokenRepository.constructor.name,
      'PrismaVerificationTokenRepository'
    );

    assert.ok(repos.auditEventRepository, 'auditEventRepository is missing');
    assert.strictEqual(
      repos.auditEventRepository.constructor.name,
      'PrismaAuditEventRepository'
    );

    await app.close();
  });
});
