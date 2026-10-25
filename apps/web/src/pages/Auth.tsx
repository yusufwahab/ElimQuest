import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { brand } from '@elimquest/config';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/api';
import { Alert, Button, Input, PageLoading } from '../components/ui';
import { AvatarFigure } from '../components/Avatar';

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="container-page grid items-center gap-8 py-8 md:grid-cols-2 md:py-14">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-ivory/80">{sub}</p>}
        <div className="card mt-5 grid gap-4">{children}</div>
        <p className="mt-4 text-sm text-ivory/75">You never need an account to join a game — only to host.</p>
      </div>
      <aside className="hidden rounded-3xl border border-line bg-gradient-to-br from-teal/50 to-ink-soft p-8 md:block" aria-hidden>
        <p className="font-display text-3xl text-amber">{brand.tagline}</p>
        <div className="mt-6 flex items-end justify-center gap-3">
          <AvatarFigure view="back" size={90} config={{ body: 'teal', eyes: 'round', glasses: 'round', headwear: 'none', gear: 'cape' }} />
          <AvatarFigure view="back" size={110} config={{ body: 'amber', eyes: 'happy', glasses: 'none', headwear: 'crown', gear: 'backpack' }} />
          <AvatarFigure view="back" size={90} config={{ body: 'violet', eyes: 'calm', glasses: 'none', headwear: 'none', gear: 'scarf' }} />
        </div>
      </aside>
    </div>
  );
}

function PasswordInput({ label, value, onChange, error, autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-1.5">
      <Input label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} error={error} autoComplete={autoComplete} hint={hint} required />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-amber" checked={show} onChange={(e) => setShow(e.target.checked)} />Show password</label>
    </div>
  );
}

export default function Auth() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const auth = useAuth();
  const loc = useLocation();
  const dest = (loc.state as { from?: string } | null)?.from ?? params.get('next') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  // Callback: Supabase completes the session from the URL; we wait for it.
  useEffect(() => { if (pathname === '/auth/callback' && auth.user) nav(dest, { replace: true }); }, [pathname, auth.user, nav, dest]);
  if (pathname === '/auth/callback') {
    return <div className="container-page py-16"><PageLoading label="Finishing sign-in…" /><p className="text-center text-sm text-ivory/70">If nothing happens, <Link className="underline" to="/sign-in">sign in again</Link>.</p></div>;
  }
  if (auth.user && pathname !== '/reset-password') return <Navigate to={dest} replace />;

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setInfo(null); setBusy(true);
    try { await fn(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  const devNote = auth.mode === 'dev' && <Alert tone="warn" title="Local development accounts">Supabase isn’t configured, so accounts are stored in the local dev database and no emails are sent. Try host@dev.local / devpassword1.</Alert>;

  if (pathname === '/sign-up') {
    return (
      <Shell title="Create your account" sub="Host games, save results and build private question packs.">
        {devNote}
        <form className="grid gap-4" noValidate onSubmit={run(async () => {
          if (password.length < 8) throw new Error('Password must be at least 8 characters.');
          const r = await auth.signUp(email.trim(), password, name.trim() || email.split('@')[0]!);
          if (r.needsVerification) { setInfo(`We sent a verification link to ${email}. Open it to finish creating your account.`); setCooldown(30); } else nav(dest, { replace: true });
        })}>
          <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required maxLength={40} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
          {err && <Alert tone="error">{err}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <Button type="submit" loading={busy}>Create account</Button>
          {info && <Button variant="ghost" disabled={cooldown > 0} onClick={() => { void auth.resendVerification(email).then(() => setCooldown(30)); }}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}</Button>}
        </form>
        <p className="flex min-h-11 flex-wrap items-center gap-1 text-sm">Already have an account? <Link className="inline-flex min-h-11 items-center underline" to="/sign-in" state={loc.state}>Sign in</Link></p>
      </Shell>
    );
  }
  if (pathname === '/forgot-password') {
    return (
      <Shell title="Reset your password" sub="We’ll email you a link if an account exists.">
        {auth.mode === 'dev' ? <Alert tone="warn" title="Not available locally">Password reset needs email delivery, which is off in local development mode.</Alert> : null}
        <form className="grid gap-4" noValidate onSubmit={run(async () => { await auth.forgotPassword(email.trim()); setInfo('If an account exists for that address, a reset link is on its way.'); setCooldown(30); })}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          {err && <Alert tone="error">{err}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <Button type="submit" loading={busy} disabled={cooldown > 0}>{cooldown > 0 ? `Try again in ${cooldown}s` : 'Send reset link'}</Button>
        </form>
        <Link className="inline-flex min-h-11 items-center text-sm underline" to="/sign-in">Back to sign in</Link>
      </Shell>
    );
  }
  if (pathname === '/reset-password') {
    return (
      <Shell title="Choose a new password">
        <form className="grid gap-4" noValidate onSubmit={run(async () => { if (password.length < 8) throw new Error('Password must be at least 8 characters.'); await auth.updatePassword(password); nav('/dashboard', { replace: true }); })}>
          <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" loading={busy}>Save password</Button>
        </form>
      </Shell>
    );
  }
  return (
    <Shell title="Sign in" sub="Welcome back.">
      {devNote}
      <form className="grid gap-4" noValidate onSubmit={run(async () => { await auth.signIn(email.trim(), password); nav(dest, { replace: true }); })}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><Link className="inline-flex min-h-11 items-center underline" to="/forgot-password">Forgot password?</Link><span className="inline-flex min-h-11 flex-wrap items-center gap-1">New here? <Link className="inline-flex min-h-11 items-center underline" to="/sign-up" state={loc.state}>Create an account</Link></span></div>
    </Shell>
  );
}
