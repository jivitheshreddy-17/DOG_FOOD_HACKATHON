import { describe, it } from 'node:test';
import assert from 'node:assert';
import { prisma, PrismaTransactionClient } from '../prisma.client';
import { PrismaTransactionManager } from '../prisma.transaction';

describe('PrismaTransactionManager', () => {
  it('should rollback transaction when an error is thrown', async () => {
    const tm = new PrismaTransactionManager(prisma);

    // Ensure state is clean before test
    const testEmail = 'transaction-test@example.com';
    await prisma.user.deleteMany({ where: { email: testEmail } });

    try {
      await tm.run(async (repos) => {
        // Operation A: Create a user
        await repos.userRepository.create({
          id: 'test-user-id',
          email: testEmail,
          passwordHash: 'dummy',
          role: 'PARTICIPANT',
        });

        // Operation B: Throw an error
        throw new Error('Simulated repository error');
      });
      assert.fail('Transaction should have thrown');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Simulated repository error');
    }

    // Verify rollback: Operation A should not have persisted
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    assert.strictEqual(userInDb, null, 'User should not exist after transaction rollback');
  });

  it('exposes exactly 15 repositories inside the transaction callback', async () => {
    const tm = new PrismaTransactionManager(prisma);
    await tm.run(async (repos) => {
      assert.ok(repos.userRepository);
      assert.ok(repos.sessionRepository);
      assert.ok(repos.teamRepository);
      assert.ok(repos.teamMemberRepository);
      assert.ok(repos.projectRepository);
      assert.ok(repos.eventRepository);
      assert.ok(repos.trackRepository);
      
      assert.ok(repos.rubricRepository);
      assert.ok(repos.judgeAssignmentRepository);
      assert.ok(repos.scoreRepository);
      assert.ok(repos.normalizationRepository);
      
      assert.ok(repos.communityVoteRepository);
      assert.ok(repos.projectCommentRepository);
      assert.ok(repos.verificationTokenRepository);
      assert.ok(repos.auditEventRepository);

      const keys = Object.keys(repos);
      assert.strictEqual(keys.length, 15);
    });
  });
});
