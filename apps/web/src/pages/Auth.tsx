import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { brand } from '@elimquest/config';
import { useAuth } from '../lib/auth';
import { ApiError, api, errMsg } from '../lib/api';
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

/**
 * Sign-up in two steps. 1) name + email + password → we email a 6-digit code (through Brevo); the password stays in the browser. 2) the code alone → only now is the
 * account created. Nothing exists until the email is proven, so mistyped or fake addresses leave no junk accounts.
 */
function SignUpFlow({ fromState }: { fromState: unknown }) {
  const auth = useAuth();
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  const sendCode = async (isResend: boolean) => {
    setBusy(true); setErr(null); setCodeErr(null); setNote(null);
    try {
      const r = await auth.startSignup(email.trim().toLowerCase(), name.trim());
      setCooldown(r.cooldown); setStep('code'); setCode('');
      if (isResend) setNote('A new code is on its way. Only the newest code works.');
      // Local development has no real email delivery, so the page shows the code (never shown against a real mail service).
      if (auth.mode === 'dev') {
        try { const m = await api<{ code: string | null }>('GET', `/api/dev/last-email?to=${encodeURIComponent(email.trim().toLowerCase())}`, undefined, { auth: false }); setDevCode(m.code); } catch { setDevCode(null); }
      }
    } catch (x) {
      const msg = errMsg(x);
      if (step === 'code') setCodeErr(msg); else setErr(msg);
      if (x instanceof ApiError && x.code === 'cooldown') { setStep('code'); setCooldown(Number(x.details?.retryAfter ?? 30)); }
    } finally { setBusy(false); }
  };

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 1) { setErr('Please enter a display name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Please enter a valid email address.'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    void sendCode(false);
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setCodeErr('Enter the 6-digit code from your email.'); return; }
    setBusy(true); setErr(null); setCodeErr(null);
    try { await auth.completeSignup(email.trim().toLowerCase(), code, password, name.trim()); }   // signed in now: the redirect below picks the right home for this role
    catch (x) {
      const msg = errMsg(x);
      if (x instanceof ApiError && ['bad_code', 'locked'].includes(x.code)) { setCodeErr(msg); setCode(''); }
      else if (x instanceof ApiError && x.code === 'exists') setErr(`${msg}`);
      else setErr(msg);
    } finally { setBusy(false); }
  };

  if (step === 'details') {
    return (
      <Shell title="Create your account" sub="Host games, save results and build private question packs.">
        <form className="grid gap-4" noValidate onSubmit={submitDetails}>
          <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required maxLength={40} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required hint="We’ll email you a 6-digit code to confirm it’s yours." />
          <PasswordInput label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" loading={busy}>Continue</Button>
        </form>
        <p className="flex min-h-11 flex-wrap items-center gap-1 text-sm">Already have an account? <Link className="inline-flex min-h-11 items-center underline" to="/sign-in" state={fromState}>Sign in</Link></p>
      </Shell>
    );
  }
  return (
    <Shell title="Check your email" sub={`We sent a 6-digit code to ${email.trim()}.`}>
      <form className="grid gap-4" noValidate onSubmit={(e) => void submitCode(e)}>
        {devCode && <Alert tone="warn" title="Development mode">No email is delivered locally. Your code is <strong className="tracking-widest">{devCode}</strong>.</Alert>}
        <Input label="6-digit code" value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); setCodeErr(null); }}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus error={codeErr} hint="Type or paste the code. It expires after 10 minutes."
          className="text-center font-display text-3xl tracking-[0.5em]" />
        {note && <Alert tone="success">{note}</Alert>}
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify and create account</Button>
      </form>
      <div className="grid gap-1 text-sm">
        <button type="button" className="inline-flex min-h-11 items-center justify-self-start underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || busy} onClick={() => void sendCode(true)}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}</button>
        <p className="text-ivory/70">No email? Check your spam folder. If this address already has an account we email you a sign-in link instead of a code.</p>
        <button type="button" className="inline-flex min-h-11 items-center justify-self-start underline" onClick={() => { setStep('details'); setCode(''); setErr(null); setCodeErr(null); setNote(null); setDevCode(null); }}>Use a different email</button>
      </div>
    </Shell>
  );
}

export default function Auth() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const auth = useAuth();
  const loc = useLocation();
  const dest = (loc.state as { from?: string } | null)?.from ?? params.get('next') ?? (auth.user && auth.user.role !== 'member' ? '/admin' : '/dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  // Callback: Supabase completes the session from the URL (password-reset links); we wait for it.
  useEffect(() => { if (pathname === '/auth/callback' && auth.user) nav(dest, { replace: true }); }, [pathname, auth.user, nav, dest]);
  if (pathname === '/auth/callback') {
    return <div className="container-page py-16"><PageLoading label="Finishing sign-in…" /><p className="text-center text-sm text-ivory/70">If nothing happens, <Link className="underline" to="/sign-in">sign in again</Link>.</p></div>;
  }
  if (auth.user && pathname !== '/reset-password' && pathname !== '/sign-up') return <Navigate to={dest} replace />;
  // While the sign-up flow finishes (it signs the person in itself) don't bounce away mid-step.
  if (auth.user && pathname === '/sign-up') return <Navigate to={dest} replace />;

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setInfo(null); setBusy(true);
    try { await fn(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  if (pathname === '/sign-up') return <SignUpFlow fromState={loc.state} />;
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
      {auth.mode === 'dev' && <Alert tone="warn" title="Local development accounts">Supabase isn’t configured, so accounts live in the local dev database. Try host@dev.local / devpassword1, or create one — the sign-up code is shown on screen.</Alert>}
      <form className="grid gap-4" noValidate onSubmit={run(async () => { await auth.signIn(email.trim(), password); })}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><Link className="inline-flex min-h-11 items-center underline" to="/forgot-password">Forgot password?</Link><span className="inline-flex min-h-11 flex-wrap items-center gap-1">New here? <Link className="inline-flex min-h-11 items-center underline" to="/sign-up" state={loc.state}>Create an account</Link></span></div>
    </Shell>
  );
}
