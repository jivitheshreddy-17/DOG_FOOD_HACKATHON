import { scrypt, randomBytes, timingSafeEqual, ScryptOptions as NodeScryptOptions } from 'node:crypto';
import { PasswordHasher } from './password-hasher.interface';

function scryptAsync(
  password: string | Buffer,
  salt: Buffer,
  keyLength: number,
  options: NodeScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, derivedKey) => {
      if (err) {
        return reject(err);
      }
      resolve(derivedKey);
    });
  });
}

export interface ScryptOptions {
  /** CPU/memory cost parameter (must be a power of 2, default: 16384) */
  cost?: number;
  /** Block size parameter (default: 8) */
  blockSize?: number;
  /** Parallelization parameter (default: 1) */
  parallelization?: number;
  /** Length of derived key in bytes (default: 64) */
  keyLength?: number;
  /** Length of random salt in bytes (default: 16) */
  saltLength?: number;
  /** Maximum memory in bytes allocated for scrypt (default: 32MB) */
  maxmem?: number;
}

/**
 * Standard dummy hash matching default saltLength (16 bytes = 32 hex) and keyLength (64 bytes = 128 hex).
 * Used during authentication to ensure constant-time response when user is not found.
 */
export const DEFAULT_DUMMY_HASH = '0'.repeat(32) + ':' + '0'.repeat(128);

/**
 * Production-ready PasswordHasher implementation using Node.js built-in scrypt.
 *
 * Stored representation format: `<saltHex>:<derivedKeyHex>`
 *
 * Security properties:
 * - Cryptographically secure pseudo-random salt generated per password
 * - Node.js native scrypt with resistant memory/cost factors
 * - Constant-time equality comparison (`timingSafeEqual`) to prevent timing side-channels
 * - Robust error handling that safely returns false on malformed or corrupt hashes
 */
export class ScryptPasswordHasher implements PasswordHasher {
  private readonly cost: number;
  private readonly blockSize: number;
  private readonly parallelization: number;
  private readonly keyLength: number;
  private readonly saltLength: number;
  private readonly maxmem: number;

  constructor(options?: ScryptOptions) {
    this.cost = options?.cost ?? 16384;
    this.blockSize = options?.blockSize ?? 8;
    this.parallelization = options?.parallelization ?? 1;
    this.keyLength = options?.keyLength ?? 64;
    this.saltLength = options?.saltLength ?? 16;
    this.maxmem = options?.maxmem ?? 32 * 1024 * 1024;
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.saltLength);
    const derivedKey = (await scryptAsync(password, salt, this.keyLength, {
      cost: this.cost,
      blockSize: this.blockSize,
      parallelization: this.parallelization,
      maxmem: this.maxmem,
    })) as Buffer;

    return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    try {
      if (typeof password !== 'string' || typeof passwordHash !== 'string') {
        return false;
      }

      const parts = passwordHash.split(':');
      if (parts.length !== 2) {
        return false;
      }

      const [saltHex, hashHex] = parts;
      if (!saltHex || !hashHex) {
        return false;
      }

      // Verify exact expected length in hex characters (2 hex chars per byte)
      if (
        saltHex.length !== this.saltLength * 2 ||
        hashHex.length !== this.keyLength * 2
      ) {
        return false;
      }

      // Verify hex-encoded representation
      if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(hashHex)) {
        return false;
      }

      const salt = Buffer.from(saltHex, 'hex');
      const expectedKey = Buffer.from(hashHex, 'hex');

      const derivedKey = (await scryptAsync(password, salt, this.keyLength, {
        cost: this.cost,
        blockSize: this.blockSize,
        parallelization: this.parallelization,
        maxmem: this.maxmem,
      })) as Buffer;

      if (derivedKey.length !== expectedKey.length) {
        return false;
      }

      return timingSafeEqual(derivedKey, expectedKey);
    } catch {
      return false;
    }
  }
}
