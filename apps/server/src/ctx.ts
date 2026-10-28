import type { Request, RequestHandler } from 'express';
import type { Env } from './env';
import type { Db } from './db/db';
import type { Auth } from './auth';
import type { GameService } from './game/service';
import type { PracticeService } from './game/practice';
import type { Mailer } from './email';
import type { SignupService } from './signup';
import type { Stats } from './stats';

export interface Ctx {
  env: Env;
  db: Db;
  auth: Auth;
  games: GameService;
  practice: PracticeService;
  mailer: Mailer;
  signup: SignupService;
  stats: Stats;
  limit: (name: string, max: number, windowMs: number, keyFn?: (req: Request) => string) => RequestHandler;
}

/** Guest/participant credential travels in a header, never in URLs or logs. */
export const guestToken = (req: Request): string | undefined => {
  const h = req.headers['x-guest-token'];
  return typeof h === 'string' && h.length >= 20 && h.length <= 200 ? h : undefined;
};
export const userKey = (req: Request) => req.user?.id ?? req.ip ?? 'anon';
