import { brand } from '@elimquest/config';
import type { Mail } from './email';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The sign-up verification email. Sent through Brevo (or logged, clearly marked "not sent", in development). */
export function otpEmail(args: { to: string; code: string; name: string; minutes: number }): Mail {
  const text = [
    `Hi ${args.name},`, '',
    `Your ${brand.name} verification code is: ${args.code}`, '',
    `It expires in ${args.minutes} minutes and works once. Enter it on the sign-up page to finish creating your account.`, '',
    "If you didn't try to sign up, you can ignore this email — no account will be created.", '',
    brand.email.footer,
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#071b2d">
<h2 style="margin:0 0 8px">Your verification code</h2>
<p>Hi ${esc(args.name)}, enter this code to finish creating your ${esc(brand.name)} account:</p>
<p style="font-size:34px;letter-spacing:.35em;font-weight:700;background:#f7f1e5;border-radius:12px;padding:14px 18px;text-align:center;margin:16px 0">${esc(args.code)}</p>
<p>It expires in ${args.minutes} minutes and works once.</p>
<p style="color:#555">If you didn't try to sign up, ignore this email — no account will be created.</p>
<p style="color:#888;font-size:12px">${esc(brand.email.footer)}</p></div>`;
  return { to: args.to, subject: `${args.code} is your ${brand.name} code`, html, text };
}

/** Sent instead of a code when the address already has an account, so the page's answer is identical either way. */
export function accountExistsEmail(args: { to: string; name: string; signInUrl: string }): Mail {
  const text = `Hi ${args.name},\n\nSomeone (hopefully you) tried to create a ${brand.name} account with this address, but it already has one.\nSign in here: ${args.signInUrl}\nIf you forgot your password, use "Forgot password" on the sign-in page.\n\nIf this wasn't you, ignore this email.\n\n${brand.email.footer}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto"><h2>You already have an account</h2><p>Hi ${esc(args.name)}, this address already has a ${esc(brand.name)} account.</p><p><a href="${esc(args.signInUrl)}">Sign in</a> (use “Forgot password” if needed). If this wasn't you, ignore this email.</p><p style="color:#888;font-size:12px">${esc(brand.email.footer)}</p></div>`;
  return { to: args.to, subject: `You already have a ${brand.name} account`, html, text };
}
