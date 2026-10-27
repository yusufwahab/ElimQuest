import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { api, setTokenProvider } from './api';
import { store } from './storage';

export interface User { id: string; email: string; displayName: string; role: 'member' | 'content_reviewer' | 'super_admin' }
type Mode = 'dev' | 'supabase';

export class AuthError extends Error {
  constructor(message: string, public code: 'unverified' | 'other' = 'other') { super(message); }
}

interface AuthCtx {
  mode: Mode;
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Step 1 of sign-up: we email a 6-digit code (via Brevo). Calling it again sends a fresh code. */
  startSignup(email: string, displayName: string): Promise<{ cooldown: number }>;
  /** Step 2: the code proves the email; only then is the account created, and the person is signed in. */
  completeSignup(email: string, code: string, password: string, displayName: string): Promise<void>;
  signOut(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refresh(): Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const authMode: Mode = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'dev';

let sbPromise: Promise<SupabaseClient> | null = null;
const supabase = () => (sbPromise ??= import('@supabase/supabase-js').then((m) => m.createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } })));

const DEV_KEY = 'eq:dev-token';

async function currentToken(): Promise<string | null> {
  if (authMode === 'dev') return store.get(DEV_KEY);
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

export const getAccessToken = () => currentToken();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => { setTokenProvider(currentToken); }, []);

  const refresh = useCallback(async () => {
    try {
      const t = await currentToken();
      if (!t) { if (mounted.current) setUser(null); return; }
      const me = await api<{ user: User }>('GET', '/api/me');
      if (mounted.current) setUser(me.user);
    } catch { if (mounted.current) setUser(null); }
    finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    let unsub: (() => void) | undefined;
    if (authMode === 'supabase') {
      void supabase().then((sb) => { const { data } = sb.auth.onAuthStateChange(() => { void refresh(); }); unsub = () => data.subscription.unsubscribe(); });
    }
    return () => { mounted.current = false; unsub?.(); };
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (authMode === 'dev') {
      const r = await api<{ token: string }>('POST', '/api/dev-auth/login', { email, password }, { auth: false });
      store.set(DEV_KEY, r.token);
    } else {
      const { error } = await (await supabase()).auth.signInWithPassword({ email, password });
      if (error) throw error.message.includes('Email not confirmed') ? new AuthError('This email isn’t confirmed yet. Please sign up again to get a new code.', 'unverified') : new AuthError('Incorrect email or password');
    }
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthCtx>(() => ({
    mode: authMode, user, loading, refresh, signIn,
    async startSignup(email, displayName) {
      return api<{ cooldown: number }>('POST', '/api/auth/signup/start', { email, displayName }, { auth: false });
    },
    async completeSignup(email, code, password, displayName) {
      await api('POST', '/api/auth/signup/verify', { email, code, password, displayName }, { auth: false });
      await signIn(email, password);
    },
    async signOut() {
      if (authMode === 'dev') store.del(DEV_KEY); else await (await supabase()).auth.signOut();
      setUser(null);
    },
    async forgotPassword(email) {
      if (authMode === 'dev') return; // dev mode has no email delivery; the page says so
      // Always resolve: the UI shows the same message whether or not the account exists (no enumeration).
      await (await supabase()).auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${import.meta.env.BASE_URL}reset-password` });
    },
    async updatePassword(password) {
      if (authMode === 'dev') throw new Error('Password reset is not available in local development mode.');
      const { error } = await (await supabase()).auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
  }), [user, loading, refresh, signIn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
