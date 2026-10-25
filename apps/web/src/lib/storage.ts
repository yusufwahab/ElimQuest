/** Every storage access is guarded: private windows / blocked storage must never break the app. */
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export const store = {
  get: (k: string): string | null => safe(() => localStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => localStorage.setItem(k, v), undefined),
  del: (k: string) => safe(() => localStorage.removeItem(k), undefined),
};

/** Random per-browser id used only for best-effort question freshness. Not an account, not tracking across sites. */
export function deviceId(): string {
  let id = store.get('eq:device');
  if (!id) { id = crypto.randomUUID(); store.set('eq:device', id); }
  return id;
}

export interface RoomCredential { token: string; participantId: string; nickname: string; spectator: boolean; at?: number }
const roomKey = (code: string) => `eq:room:${code}`;
export const roomCred = {
  get: (code: string): RoomCredential | null => safe(() => JSON.parse(store.get(roomKey(code)) ?? 'null'), null),
  set: (code: string, c: RoomCredential) => store.set(roomKey(code), JSON.stringify({ ...c, at: Date.now() })),
  del: (code: string) => store.del(roomKey(code)),
};

export interface PracticeCredential { token: string; at?: number }
export const practiceCred = {
  get: (id: string): PracticeCredential | null => safe(() => JSON.parse(store.get(`eq:practice:${id}`) ?? 'null'), null),
  set: (id: string, c: PracticeCredential) => store.set(`eq:practice:${id}`, JSON.stringify({ ...c, at: Date.now() })),
};

export interface Prefs { sound: boolean; reducedMotion: boolean }
export const prefs = {
  get: (): Prefs => safe(() => ({ sound: false, reducedMotion: false, ...JSON.parse(store.get('eq:prefs') ?? '{}') }), { sound: false, reducedMotion: false }),
  set: (p: Prefs) => { store.set('eq:prefs', JSON.stringify(p)); applyPrefs(p); },
};
export function applyPrefs(p: Prefs = prefs.get()) {
  document.documentElement.dataset.motion = p.reducedMotion ? 'reduced' : 'full';
}

export const lastAvatar = {
  get: () => safe(() => JSON.parse(store.get('eq:avatar') ?? 'null'), null),
  set: (v: unknown) => store.set('eq:avatar', JSON.stringify(v)),
};
export const lastNickname = { get: () => store.get('eq:nick') ?? '', set: (v: string) => store.set('eq:nick', v) };

/** gameId -> room code, so the results page (addressed by game id) can find the right credential. */
export const gameCode = { get: (gameId: string) => store.get(`eq:game:${gameId}`), set: (gameId: string, code: string) => store.set(`eq:game:${gameId}`, code) };

/** Recently used room/practice credentials (newest first), used by the landing page's "Rejoin" banner. */
export function recentCredentials(): { kind: 'room' | 'practice'; key: string; at: number }[] {
  const out: { kind: 'room' | 'practice'; key: string; at: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      const m = /^eq:(room|practice):(.+)$/.exec(k);
      if (!m) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? 'null') as { at?: number; spectator?: boolean } | null;
      if (!v || v.spectator || !v.at || Date.now() - v.at > 24 * 3600_000) continue;
      out.push({ kind: m[1] as 'room' | 'practice', key: m[2]!, at: v.at });
    }
  } catch { /* storage unavailable */ }
  return out.sort((a, b) => b.at - a.at);
}
export const quickRules = {
  get: (): { superQuestion: boolean; gentle: boolean } => safe(() => ({ superQuestion: false, gentle: false, ...JSON.parse(store.get('eq:quickrules') ?? '{}') }), { superQuestion: false, gentle: false }),
  set: (v: { superQuestion: boolean; gentle: boolean }) => store.set('eq:quickrules', JSON.stringify(v)),
};
export const tutorial = { done: () => store.get('eq:tutorial') === '1', finish: () => store.set('eq:tutorial', '1') };
