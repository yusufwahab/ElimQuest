import { API_URL } from './api';

/**
 * Privacy-friendly visit counter. Sends only the page path and (once per tab) the referring site to our own server.
 * No cookie, no ID, nothing stored in the browser except a "referrer already sent" flag. Honours Do-Not-Track / Global Privacy Control.
 */
let last = '';
const optedOut = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack === '1' || n.globalPrivacyControl === true;
};
const post = (path: string, body?: unknown) => {
  try { void fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, keepalive: true }).catch(() => undefined); } catch { /* counting must never break the app */ }
};

export function trackPageview(path: string) {
  if (optedOut() || path === last || path.startsWith('/admin')) return;
  last = path;
  let ref: string | undefined;
  try {
    if (!sessionStorage.getItem('eq:ref')) { sessionStorage.setItem('eq:ref', '1'); if (document.referrer) ref = document.referrer; }
  } catch { /* storage may be blocked */ }
  post('/api/t', { path, ref });
}

export function trackSigninFailed() { if (!optedOut()) post('/api/t/signin-failed'); }
