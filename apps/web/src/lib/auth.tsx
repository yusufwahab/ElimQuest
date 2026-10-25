import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { api, setTokenProvider } from './api';
import { store } from './storage';

export interface User { id: string; email: string; displayName: string; role: 'member' | 'content_reviewer' | 'super_admin' }
type Mode = 'dev' | 'supabase';

interface AuthCtx {
  mode: Mode;
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<{ needsVerification: boolean }>;
  signOut(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
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

  const value = useMemo<AuthCtx>(() => ({
    mode: authMode, user, loading, refresh,
    async signIn(email, password) {
      if (authMode === 'dev') {
        const r = await api<{ token: string }>('POST', '/api/dev-auth/login', { email, password }, { auth: false });
        store.set(DEV_KEY, r.token);
      } else {
        const { error } = await (await supabase()).auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message.includes('Email not confirmed') ? 'Please verify your email first. Check your inbox for the link.' : 'Incorrect email or password');
      }
      await refresh();
    },
    async signUp(email, password, displayName) {
      if (authMode === 'dev') {
        const r = await api<{ token: string }>('POST', '/api/dev-auth/register', { email, password, displayName }, { auth: false });
        store.set(DEV_KEY, r.token);
        await refresh();
        return { needsVerification: false };
      }
      const { data, error } = await (await supabase()).auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}auth/callback` } });
      if (error) throw new Error(error.message);
      return { needsVerification: !data.session };
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
    async resendVerification(email) {
      if (authMode === 'dev') return;
      await (await supabase()).auth.resend({ type: 'signup', email });
    },
  }), [user, loading, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
