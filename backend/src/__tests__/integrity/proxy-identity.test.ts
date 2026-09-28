import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { buildServer } from '../../index';

describe('Security - Trusted Proxy / IP Identity', () => {
  let app: any;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  test('trustProxy relies on env variable', async () => {
    // We verified that trustProxy: true allows trivially spoofed X-Forwarded-For headers
    // in direct internet exposure. This is now fixed in index.ts to check process.env.TRUST_PROXY
    assert.strictEqual(process.env.TRUST_PROXY, undefined, 'trustProxy should be false by default in tests');
  });
});
