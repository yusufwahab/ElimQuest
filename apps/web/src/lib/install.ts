import { useSyncExternalStore } from 'react';
import { API_URL } from './api';

/**
 * "Add to home screen" support.
 *  - Chrome / Edge / Samsung Internet (Android, desktop) fire `beforeinstallprompt`; we keep the event and show our own Install button.
 *  - iPhones and iPads (Safari) have no install prompt, so we show short step-by-step instructions instead.
 *  - Inside another app's browser (WhatsApp, Facebook, Instagram…) installing is impossible, so we ask people to open the page in their browser.
 */
type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type InstallKind = 'installed' | 'prompt' | 'ios' | 'inapp' | 'none';

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|; wv\)|WhatsApp/i;
const IOS = /iPhone|iPad|iPod/i;

/** Pure decision, so it can be tested without a browser. */
export function installKind(ua: string, standalone: boolean, hasPrompt: boolean, touchMac = false): InstallKind {
  if (standalone) return 'installed';
  if (hasPrompt) return 'prompt';
  const ios = IOS.test(ua) || touchMac; // iPadOS reports itself as a Mac with a touch screen
  if (IN_APP.test(ua)) return ios || /Android/i.test(ua) ? 'inapp' : 'none';
  if (ios) return 'ios';
  return 'none';
}

export function isStandalone(): boolean {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; }
}

let deferred: PromptEvent | null = null;
let installed = typeof window !== 'undefined' && isStandalone();
const subs = new Set<() => void>();

function compute(): InstallKind {
  if (typeof navigator === 'undefined') return 'none';
  const touchMac = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return installKind(navigator.userAgent, installed, !!deferred, touchMac);
}
let snapshot: InstallKind = compute();
const emit = () => { snapshot = compute(); subs.forEach((f) => f()); };

if (typeof window !== 'undefined') {
  // Registered at import time: the browser fires this once, early, possibly before React has mounted.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; emit(); });
  window.addEventListener('appinstalled', () => {
    installed = true; deferred = null; emit();
    try { void fetch(`${API_URL}/api/t/install`, { method: 'POST', keepalive: true }).catch(() => undefined); } catch { /* counting must never break the app */ }
  });
}

/** Opens the browser's own install dialog. Returns 'help' when the person needs manual steps (iPhone, in-app browser). */
export async function runInstall(): Promise<'accepted' | 'dismissed' | 'help'> {
  if (!deferred) return 'help';
  const ev = deferred;
  await ev.prompt();
  const choice = await ev.userChoice;
  deferred = null; emit();
  return choice.outcome;
}

export function useInstallKind(): InstallKind {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => snapshot, () => 'none' as InstallKind);
}

const KEY = 'eq:install-dismissed';
const WEEK = 7 * 24 * 3600 * 1000;
export const bannerDismissed = (): boolean => { try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WEEK; } catch { return false; } };
export const dismissBanner = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };
