import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { brand } from '@elimquest/config';
import { useAuth } from '../lib/auth';
import { AdventurerChip } from '../lib/adventurer';
import { prefs as prefStore } from '../lib/storage';
import { Button, PageLoading } from './ui';

export function Emblem({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 6l6 11 11-4-5 11 11 6-11 6 5 11-11-5-6 14-6-14-11 5 5-11L8 30l11-6-5-11 11 4z" fill="none" stroke="#F2B858" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="32" cy="30" r="5" fill="#19A7B8" />
    </svg>
  );
}

export function Brand() {
  return <Link to="/" className="flex min-h-11 items-center gap-2.5 rounded-lg" aria-label={`${brand.name} home`}><Emblem /><span className="font-display text-xl tracking-tight">{brand.name}</span></Link>;
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    addEventListener('online', u); addEventListener('offline', d);
    return () => { removeEventListener('online', u); removeEventListener('offline', d); };
  }, []);
  return on;
}

export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState(prefStore.get());
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) { setP(prefStore.get()); d.showModal(); } if (!open && d.open) d.close(); }, [open]);
  const update = (n: Partial<typeof p>) => { const next = { ...p, ...n }; setP(next); prefStore.set(next); };
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-ink-soft p-0 text-ivory backdrop:bg-black/70" aria-labelledby="prefs-title">
      <div className="grid gap-4 p-5">
        <h2 id="prefs-title" className="text-xl">Accessibility &amp; preferences</h2>
        <label className="flex min-h-11 items-center justify-between gap-4"><span>Sound effects<span className="block text-xs text-ivory/70">Off by default. Never required to play.</span></span>
          <input type="checkbox" className="size-6 accent-amber" checked={p.sound} onChange={(e) => update({ sound: e.target.checked })} /></label>
        <label className="flex min-h-11 items-center justify-between gap-4"><span>Reduce motion<span className="block text-xs text-ivory/70">Skips climbing animations and celebrations.</span></span>
          <input type="checkbox" className="size-6 accent-amber" checked={p.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} /></label>
        <p className="text-xs text-ivory/70">These are saved only in this browser. <Link to="/help#accessibility" className="underline" onClick={onClose}>Accessibility help</Link></p>
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </dialog>
  );
}

function AccountMenu() {
  const { user, signOut, loading } = useAuth();
  const nav = useNavigate();
  if (loading) return <span className="min-h-11 w-16" />;
  if (!user) return <NavLink to="/sign-in" className="btn btn-ghost !min-h-11">Sign in</NavLink>;
  return (
    <div className="flex items-center gap-2">
      <NavLink to="/dashboard" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/10">Dashboard</NavLink>
      {user.role !== 'member' && <NavLink to="/admin" className="inline-flex min-h-11 items-center rounded-lg bg-amber/15 px-3 py-2 text-sm font-semibold text-amber hover:bg-amber/25">Admin area</NavLink>}
      <NavLink to="/account" className="inline-flex min-h-11 max-w-32 items-center truncate rounded-lg px-3 py-2 text-sm hover:bg-white/10" title={`${user.displayName} · ${user.email}`}>Account</NavLink>
      <Button variant="ghost" className="!min-h-10 !px-3 text-sm" onClick={async () => { await signOut(); nav('/'); }}>Sign out</Button>
    </div>
  );
}

export function Navbar({ transparent = false }: { transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { user } = useAuth();
  useEffect(() => setOpen(false), [loc.pathname]);
  const link = ({ isActive }: { isActive: boolean }) => `inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 ${isActive ? 'text-amber' : 'text-ivory/90'}`;
  return (
    <header className={`relative z-30 border-b border-line/60 ${transparent ? 'bg-ink/70 backdrop-blur-sm' : 'bg-ink'}`}>
      <nav className="container-page flex min-h-16 items-center justify-between gap-3" aria-label="Main">
        <Brand />
        <div className="hidden items-center gap-1 md:flex"><NavLink to="/topics" className={link}>Explore topics</NavLink><NavLink to="/how-it-works" className={link}>How it works</NavLink></div>
        <div className="hidden items-center gap-2 md:flex"><AdventurerChip /><AccountMenu /></div>
        <button className="btn btn-ghost !px-3 md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </nav>
      {open && (
        <div id="mobile-nav" className="container-page grid gap-1 pb-4 md:hidden">
          <NavLink to="/topics" className={link}>Explore topics</NavLink>
          <NavLink to="/how-it-works" className={link}>How it works</NavLink>
          <NavLink to="/practice" className={link}>Practise solo</NavLink>
          <div className="py-1"><AdventurerChip /></div>
          {user ? <><NavLink to="/dashboard" className={link}>Dashboard</NavLink>{user.role !== 'member' && <NavLink to="/admin" className={link}>Admin area</NavLink>}<NavLink to="/account" className={link}>Account</NavLink></> : <NavLink to="/sign-in" className={link}>Sign in</NavLink>}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const [prefsOpen, setPrefsOpen] = useState(false);
  return (
    <footer className="mt-16 border-t border-line/60 bg-ink-soft/40 py-6 text-sm text-ivory/75 sm:py-8">
      <div className="container-page flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {brand.name}. Quiz scores are for fun and learning — never a measure of faith.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-0">
          {[['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/help', 'Help']].map(([to, l]) => <li key={to}><Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" to={to!}>{l}</Link></li>)}
          <li><button className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" onClick={() => setPrefsOpen(true)}>Accessibility &amp; preferences</button></li>
        </ul>
      </div>
      <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </footer>
  );
}

export function SiteLayout({ children }: { children?: ReactNode }) {
  const online = useOnline();
  const loc = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  // Move focus to <main> on in-app navigation only, so the first Tab on a fresh load reaches the skip link.
  useEffect(() => { if (first.current) { first.current = false; return; } main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  const home = loc.pathname === '/';
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-ink">Skip to content</a>
      {!online && <div role="alert" className="bg-danger/90 px-4 py-2 text-center text-sm font-semibold text-ink">You’re offline. We’ll reconnect automatically.</div>}
      <Navbar transparent={home} />
      <main id="main" ref={main} tabIndex={-1} className="flex-1 outline-none"><Suspense fallback={<PageLoading />}>{children ?? <Outlet />}</Suspense></main>
      <Footer />
    </div>
  );
}
