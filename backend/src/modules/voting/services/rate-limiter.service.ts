import Redis from 'ioredis';

export interface RateLimiterService {
  checkLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiterService {
  private counts = new Map<string, { count: number; resetAt: number }>();

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const record = this.counts.get(key);

    if (!record || now > record.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (record.count >= limit) {
      return false;
    }

    record.count++;
    return true;
  }
}

export class RedisRateLimiter implements RateLimiterService {
  constructor(private readonly redis: Redis) {}

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const windowSeconds = Math.ceil(windowMs / 1000);
    
    // Atomically increment and set TTL if new
    const result = await this.redis
      .pipeline()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .exec();

    if (!result || result.length === 0) {
      return true; // Fallback to allow if pipelining fails
    }

    const currentCount = result[0][1] as number;
    return currentCount <= limit;
  }
}
