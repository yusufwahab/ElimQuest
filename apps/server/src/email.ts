import { brand } from '@elimquest/config';
import type { Env } from './env';

export interface Mail { to: string; subject: string; html: string; text: string }
export type SendResult = { status: 'sent' | 'logged_dev' | 'failed'; error?: string };

/**
 * Brevo transactional email. In EMAIL_MODE=log (development) nothing is sent: the message is printed
 * and recorded as `logged_dev`, so it can never be mistaken for a delivered email.
 */
export class Mailer {
  public outbox: Mail[] = [];
  constructor(private env: Env) {}

  async send(mail: Mail): Promise<SendResult> {
    if (this.env.EMAIL_MODE === 'log') {
      this.outbox.push(mail);
      if (this.env.NODE_ENV !== 'test') console.log(`[email:not-sent] to=${mail.to} subject="${mail.subject}"`);
      return { status: 'logged_dev' };
    }
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: this.env.BREVO_SENDER_EMAIL, name: this.env.BREVO_SENDER_NAME },
          to: [{ email: mail.to }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
        }),
      });
      if (!res.ok) return { status: 'failed', error: `Brevo responded ${res.status}` };
      return { status: 'sent' };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function hostConfirmationEmail(args: { to: string; title: string; code: string; joinUrl: string; when: string | null; timezone: string; hostMode: string }): Mail {
  const when = args.when ? `${args.when} (${args.timezone})` : 'Open now';
  const text = [
    `Your ${brand.name} game "${args.title}" is ready.`,
    `Room code: ${args.code}`,
    `Join link: ${args.joinUrl}`,
    `Gathering time: ${when}`,
    '',
    'Share this link with your own audience — the game does not start automatically. Start it yourself from the lobby when everyone has arrived.',
    'Note: ElimQuest does not message your audience for you.',
    '',
    brand.email.footer,
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
<h2>Your game is ready</h2><p><strong>${esc(args.title)}</strong></p>
<p>Room code: <strong style="font-size:1.4em;letter-spacing:.1em">${esc(args.code)}</strong></p>
<p><a href="${esc(args.joinUrl)}">${esc(args.joinUrl)}</a></p>
<p>Gathering time: ${esc(when)}</p>
<p>Please share this link with your own audience. The game <strong>does not start automatically</strong> — start it from the lobby when everyone has arrived.</p>
<p style="color:#666;font-size:12px">${esc(brand.email.footer)}</p></div>`;
  return { to: args.to, subject: `${brand.name}: your game ${args.code} is ready`, html, text };
}
