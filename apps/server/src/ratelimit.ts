import type { NextFunction, Request, Response } from 'express';
import type { Env } from './env';
import { HttpError } from './repo/util';

export interface Counter { hit(key: string, windowMs: number): Promise<number>; close(): Promise<void> }

/** Single-instance in-memory counter: the tested fallback when Redis is not configured. */
export class MemoryCounter implements Counter {
  private m = new Map<string, { n: number; reset: number }>();
  private t = setInterval(() => { const now = Date.now(); for (const [k, v] of this.m) if (v.reset < now) this.m.delete(k); }, 30_000);
  constructor() { this.t.unref(); }
  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const cur = this.m.get(key);
    if (!cur || cur.reset < now) { this.m.set(key, { n: 1, reset: now + windowMs }); return 1; }
    return ++cur.n;
  }
  async close() { clearInterval(this.t); }
}

/** Redis-backed counter (one INCR + PEXPIRE per hit). Only used when REDIS_URL is set; DB stays authoritative. */
export class RedisCounter implements Counter {
  private r: import('ioredis').Redis | undefined;
  constructor(private url: string, private fallback: MemoryCounter) {}
  private async client() {
    if (!this.r) {
      const { default: IORedis } = await import('ioredis');
      this.r = new IORedis(this.url, { maxRetriesPerRequest: 1, lazyConnect: false, enableOfflineQueue: false });
      this.r.on('error', () => undefined);
    }
    return this.r;
  }
  async hit(key: string, windowMs: number) {
    try {
      const r = await this.client();
      const k = `rl:${key}`;
      const n = await r.incr(k);
      if (n === 1) await r.pexpire(k, windowMs);
      return n;
    } catch {
      // Redis outage: degrade to the single-instance counter (never fail open to unlimited).
      return this.fallback.hit(key, windowMs);
    }
  }
  async close() { await this.r?.quit().catch(() => undefined); }
}

export function makeCounter(env: Env): Counter {
  const mem = new MemoryCounter();
  return env.REDIS_URL ? new RedisCounter(env.REDIS_URL, mem) : mem;
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function limiter(counter: Counter, env: Env) {
  return (name: string, max: number, windowMs: number, keyFn: (req: Request) => string = clientIp) =>
    async (req: Request, res: Response, next: NextFunction) => {
      if (env.RATE_LIMIT_DISABLED) return next();
      const n = await counter.hit(`${name}:${keyFn(req)}`, windowMs);
      if (n > max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return next(new HttpError(429, 'Too many attempts. Please wait a moment and try again.', 'rate_limited'));
      }
      next();
    };
}
