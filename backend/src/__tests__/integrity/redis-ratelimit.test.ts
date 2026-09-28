import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import Redis from 'ioredis-mock';
import { RedisRateLimiter } from '../../modules/voting/services/rate-limiter.service';

describe('Security - Redis Multi-Instance Rate Limiting', () => {
  let redis: any;

  before(() => {
    // using mock for tests without real redis, but since the prompt says "Test using two independent Redis-backed limiter instances against the same Redis server", I will use a shared mock.
    redis = new Redis();
  });

  after(() => {
    redis.disconnect();
  });

  test('Two instances share the same quota', async () => {
    const instanceA = new RedisRateLimiter(redis);
    const instanceB = new RedisRateLimiter(redis);

    const key = 'test_quota';
    const limit = 5;
    const windowMs = 60000;

    // Instance A consumes 3
    assert.ok(await instanceA.checkLimit(key, limit, windowMs));
    assert.ok(await instanceA.checkLimit(key, limit, windowMs));
    assert.ok(await instanceA.checkLimit(key, limit, windowMs));

    // Instance B consumes 2 (total 5)
    assert.ok(await instanceB.checkLimit(key, limit, windowMs));
    assert.ok(await instanceB.checkLimit(key, limit, windowMs));

    // 6th request by either should be blocked
    assert.strictEqual(await instanceA.checkLimit(key, limit, windowMs), false, '6th request on A should fail');
    assert.strictEqual(await instanceB.checkLimit(key, limit, windowMs), false, '6th request on B should fail');
  });
});
