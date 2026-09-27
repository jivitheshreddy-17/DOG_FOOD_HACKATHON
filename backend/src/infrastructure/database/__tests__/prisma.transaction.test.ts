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
});
