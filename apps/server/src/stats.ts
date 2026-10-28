import { createHmac } from 'node:crypto';
import type { Db } from './db/db';
import type { Env } from './env';
import { audit, many, one } from './repo/util';

/**
 * First-party usage statistics. Privacy by design:
 *  - no cookie, no IP address and no user-agent string is ever stored;
 *  - a unique visitor is a keyed hash of IP + browser that changes every day and is deleted after two days;
 *  - everything shown is a count; signed-in activity is stored as "this account was active on this day".
 * Staff pages (/admin) are never counted. Browsers that send Do-Not-Track or Global Privacy Control are not counted at all.
 */

const today = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => today(new Date(Date.now() - n * 86_400_000));
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|uptime|headless|lighthouse|pingdom|curl|wget|python-requests|node-fetch/i;
const KNOWN = new Set(['topics', 'how-it-works', 'sign-in', 'sign-up', 'forgot-password', 'reset-password', 'auth', 'dashboard', 'games', 'join', 'practice', 'packs', 'account', 'help', 'privacy', 'terms', 'expired', 'maintenance', 'rooms']);

/** Collapse a URL path into a small, fixed set of route patterns (room codes and ids never reach the database). Null = do not count. */
export function normalisePath(raw: string): string | null {
  const bare = (raw.split(/[?#]/)[0] ?? '').replace(/\/+$/, '') || '/';
  if (!bare.startsWith('/')) return null;
  if (bare === '/') return '/';
  const seg = bare.split('/').slice(1, 4).map((s) => (/^\d{4,}$/.test(s) ? ':code' : /^[0-9a-f-]{32,36}$/i.test(s) ? ':id' : s.slice(0, 40).toLowerCase()));
  if (seg[0] === 'admin') return null;
  if (!KNOWN.has(seg[0]!)) return '/other';
  if (seg[0] === 'topics' && seg[1]) seg[1] = ':slug';
  return `/${seg.join('/')}`;
}

export function deviceOf(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}
export function browserOf(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

export interface PageviewInput { path: string; ref?: string; ua: string; ip: string; optOut: boolean }
export interface SeenUser { id: string; sessionId?: string }

export class Stats {
  private buf = new Map<string, number>();
  private vidCache = new Set<string>();
  private vidDay = '';
  private seenSessions = new Set<string>();
  private seenUserDay = new Set<string>();
  private udDay = '';
  private timer: NodeJS.Timeout;
  private lastMaintenance = 0;
  private ownHosts: Set<string>;

  constructor(private db: Db, private env: Env) {
    this.ownHosts = new Set(env.ALLOWED_ORIGINS.map((o) => { try { return new URL(o).hostname.replace(/^www\./, ''); } catch { return ''; } }));
    this.timer = setInterval(() => void this.flush().catch(() => undefined), 5000);
    this.timer.unref?.();
  }

  private bump(day: string, metric: string, key = '', n = 1) {
    const k = `${day}|${metric}|${key}`;
    this.buf.set(k, (this.buf.get(k) ?? 0) + n);
  }

  async flush() {
    if (this.buf.size) {
      const rows = [...this.buf.entries()]; this.buf.clear();
      for (const [k, n] of rows) {
        const [day, metric, key] = k.split('|') as [string, string, string];
        await this.db.query('insert into site_daily(day, metric, key, n) values ($1::date,$2,$3,$4) on conflict (day, metric, key) do update set n = site_daily.n + excluded.n', [day, metric, key, n]);
      }
    }
    if (Date.now() - this.lastMaintenance > 3_600_000) { this.lastMaintenance = Date.now(); await this.maintenance(); }
  }

  /** Retention: unique-visitor hashes 2 days, sign-in sessions and sign-in log lines 90 days, daily-active rows 13 months. Daily totals are kept. */
  async maintenance() {
    await this.db.query("delete from site_visitors where day < current_date - 1");
    await this.db.query("delete from session_seen where first_seen < now() - interval '90 days'");
    await this.db.query("delete from audit_events where action like 'auth.%' and created_at < now() - interval '90 days'");
    await this.db.query("delete from user_days where day < current_date - 400");
  }

  stop() { clearInterval(this.timer); return this.flush().catch(() => undefined); }

  private visitorId(day: string, ip: string, ua: string) {
    const daily = createHmac('sha256', this.env.OTP_SECRET).update(`stats:${day}`).digest();
    return createHmac('sha256', daily).update(`${ip}|${ua}`).digest('hex').slice(0, 24);
  }

  async pageview(i: PageviewInput) {
    if (i.optOut || !i.ua || BOT.test(i.ua)) return;
    const page = normalisePath(i.path);
    if (!page) return;
    const d = today();
    if (this.vidDay !== d) { this.vidDay = d; this.vidCache.clear(); }
    this.bump(d, 'pageview'); this.bump(d, 'page', page);
    const vid = this.visitorId(d, i.ip, i.ua);
    if (this.vidCache.has(vid)) return;
    if (this.vidCache.size > 200_000) this.vidCache.clear();
    this.vidCache.add(vid);
    const r = await this.db.query('insert into site_visitors(day, vid) values ($1::date,$2) on conflict do nothing returning vid', [d, vid]);
    if (!r.rows.length) return;
    // Device, browser and referrer are counted once per unique visitor per day, so each breakdown adds up to the visitor total.
    this.bump(d, 'visitors'); this.bump(d, 'device', deviceOf(i.ua)); this.bump(d, 'browser', browserOf(i.ua));
    let host = '(direct)';
    try { const h = new URL(i.ref ?? '').hostname.replace(/^www\./, '').toLowerCase(); if (h && !this.ownHosts.has(h)) host = h.slice(0, 60); } catch { /* no referrer */ }
    this.bump(d, 'ref', host);
  }

  /** A sign-in is a login session we have not seen before (the session id comes from the verified token). Failed attempts are reported by the app. */
  signinFailed() { this.bump(today(), 'signin_failed'); }

  async userSeen(u: SeenUser) {
    const d = today();
    if (this.udDay !== d) { this.udDay = d; this.seenUserDay.clear(); }
    const k = `${d}|${u.id}`;
    if (!this.seenUserDay.has(k)) {
      this.seenUserDay.add(k);
      await this.db.query('insert into user_days(day, user_id) values ($1::date,$2) on conflict do nothing', [d, u.id]);
    }
    if (u.sessionId && !this.seenSessions.has(u.sessionId)) {
      if (this.seenSessions.size > 50_000) this.seenSessions.clear();
      this.seenSessions.add(u.sessionId);
      const r = await this.db.query('insert into session_seen(session_id, user_id) values ($1,$2) on conflict do nothing returning session_id', [u.sessionId, u.id]);
      if (r.rows.length) { this.bump(d, 'signin'); await audit(this.db, { actorId: u.id, action: 'auth.signin', entityType: 'profile', entityId: u.id }); }
    }
  }

  // ---- reports ---------------------------------------------------------------------------------
  async report(days: number) {
    await this.flush();
    const from = daysAgo(days - 1);
    const q = <T>(sql: string, p: unknown[] = [from]) => many<T>(this.db, sql, p);
    const [daily, signups, active, opened, finished, joined, answers, practice, since, roles, phases, play, live, mau, wau, dau] = await Promise.all([
      q<{ d: string; metric: string; key: string; n: number }>('select day::text d, metric, key, n::int from site_daily where day >= $1::date'),
      q<{ d: string; n: number }>('select created_at::date::text d, count(*)::int n from profiles where created_at >= $1::date group by 1'),
      q<{ d: string; n: number }>('select day::text d, count(*)::int n from user_days where day >= $1::date group by 1'),
      q<{ d: string; n: number }>('select opened_at::date::text d, count(*)::int n from games where opened_at >= $1::date group by 1'),
      q<{ d: string; n: number }>("select finished_at::date::text d, count(*)::int n from games where phase='finished' and finished_at >= $1::date group by 1"),
      q<{ d: string; n: number }>('select joined_at::date::text d, count(*)::int n from participants where joined_at >= $1::date and not is_spectator group by 1'),
      q<{ d: string; n: number }>('select accepted_at::date::text d, count(*)::int n from answers where accepted_at >= $1::date group by 1'),
      q<{ d: string; n: number; reached: number }>('select created_at::date::text d, count(*)::int n, count(*) filter (where succeeded)::int reached from practice_sessions where created_at >= $1::date group by 1'),
      one<{ d: string | null }>(this.db, 'select min(day)::text d from site_daily'),
      q<{ role: string; n: number }>('select role, count(*)::int n from profiles group by 1', []),
      q<{ phase: string; n: number }>("select phase, count(*)::int n from games where phase <> 'draft' group by 1", []),
      one<{ avg: number | null; answers: number; correct: number }>(this.db, "select (select avg(c)::float from (select count(*) c from participants p join games g on g.id=p.game_id where g.phase='finished' and not p.is_spectator and not p.removed group by p.game_id) x) avg, (select count(*)::int from round_outcomes where outcome in ('correct','wrong')) answers, (select count(*)::int from round_outcomes where outcome='correct') correct"),
      one<{ n: number }>(this.db, "select count(*)::int n from games where phase in ('lobby','countdown','question_open','reveal','climb','paused','recovery_pause')"),
      one<{ n: number }>(this.db, 'select count(distinct user_id)::int n from user_days where day >= current_date - 29'),
      one<{ n: number }>(this.db, 'select count(distinct user_id)::int n from user_days where day >= current_date - 6'),
      one<{ n: number }>(this.db, 'select count(*)::int n from user_days where day = current_date'),
    ]);
    const idx = <T extends { d: string }>(rows: T[]) => new Map(rows.map((r) => [r.d, r]));
    const sd = new Map<string, number>(); for (const r of daily) sd.set(`${r.d}|${r.metric}|${r.key}`, r.n);
    const si = idx(signups), ac = idx(active), op = idx(opened), fi = idx(finished), jo = idx(joined), an = idx(answers), pr = idx(practice);
    const series = Array.from({ length: days }, (_, i) => {
      const d = daysAgo(days - 1 - i);
      return {
        day: d, visitors: sd.get(`${d}|visitors|`) ?? 0, pageviews: sd.get(`${d}|pageview|`) ?? 0, signups: si.get(d)?.n ?? 0, signins: sd.get(`${d}|signin|`) ?? 0,
        signinFailed: sd.get(`${d}|signin_failed|`) ?? 0, active: ac.get(d)?.n ?? 0, gamesOpened: op.get(d)?.n ?? 0, gamesFinished: fi.get(d)?.n ?? 0,
        players: jo.get(d)?.n ?? 0, answers: an.get(d)?.n ?? 0, practice: pr.get(d)?.n ?? 0, practiceReached: pr.get(d)?.reached ?? 0,
      };
    });
    const sum = (k: keyof (typeof series)[number]) => series.reduce((a, r) => a + (r[k] as number), 0);
    const top = (metric: string, limit = 10) => {
      const m = new Map<string, number>();
      for (const r of daily) if (r.metric === metric) m.set(r.key, (m.get(r.key) ?? 0) + r.n);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, n]) => ({ key, n }));
    };
    const phase = Object.fromEntries(phases.map((p) => [p.phase, p.n]));
    return {
      days, from, generatedAt: new Date().toISOString(), trackingSince: since?.d ?? null, series,
      totals: {
        visitors: sum('visitors'), pageviews: sum('pageviews'), signups: sum('signups'), signins: sum('signins'), signinFailed: sum('signinFailed'),
        gamesOpened: sum('gamesOpened'), gamesFinished: sum('gamesFinished'), players: sum('players'), answers: sum('answers'), practice: sum('practice'), practiceReached: sum('practiceReached'),
      },
      activeUsers: { today: dau?.n ?? 0, week: wau?.n ?? 0, month: mau?.n ?? 0 },
      top: { pages: top('page'), referrers: top('ref'), devices: top('device'), browsers: top('browser') },
      platform: {
        accounts: roles.reduce((a, r) => a + r.n, 0), roles: Object.fromEntries(roles.map((r) => [r.role, r.n])),
        gamesByPhase: phase, liveRooms: live?.n ?? 0, avgPlayersPerFinishedGame: play?.avg != null ? Math.round(play.avg * 10) / 10 : null,
        answersAllTime: play?.answers ?? 0, accuracyAllTime: play && play.answers ? Math.round((play.correct / play.answers) * 1000) / 10 : null,
      },
    };
  }

  /** Per question version, from scored multiplayer rounds: how many answered and what share were right. Highlights likely-wrong keys and too-easy questions. */
  async questionQuality(opts: { sort: 'hardest' | 'easiest' | 'reported' | 'most'; min: number; limit: number }) {
    const order = { hardest: 'pct asc, answered desc', easiest: 'pct desc, answered desc', reported: 'reports desc, answered desc', most: 'answered desc' }[opts.sort];
    return many<{ id: string; text: string; level: number; category: string; status: string; answered: number; correct: number; pct: number; reports: number; isFixture: boolean }>(this.db,
      `select qv.id, qv.text, qv.level, c.name as category, qv.status, qv.is_fixture as "isFixture",
              count(*) filter (where ro.outcome in ('correct','wrong'))::int as answered,
              count(*) filter (where ro.outcome = 'correct')::int as correct,
              round(100.0 * count(*) filter (where ro.outcome = 'correct') / nullif(count(*) filter (where ro.outcome in ('correct','wrong')), 0), 1)::float as pct,
              (select count(*)::int from content_reports cr where cr.version_id = qv.id) as reports
         from round_outcomes ro
         join rounds r on r.id = ro.round_id and r.status = 'scored'
         join game_questions gq on gq.id = r.game_question_id
         join question_versions qv on qv.id = gq.question_version_id
         join questions qu on qu.id = qv.question_id
         join categories c on c.id = qu.category_id
        group by qv.id, c.name
       having count(*) filter (where ro.outcome in ('correct','wrong')) >= $1
        order by ${order}
        limit $2`, [opts.min, opts.limit]);
  }
}
