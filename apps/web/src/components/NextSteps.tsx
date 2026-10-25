import { useState, type ReactNode } from 'react';
import type { AvatarConfig } from '@elimquest/game-core';
import { saveBlob } from '../lib/api';
import { Button } from './ui';

export interface NextCard { key: string; title: string; text: string; action: ReactNode }

/** "What next?" — the finish line should lead somewhere. Cards are built from real results only. */
export function NextSteps({ cards }: { cards: NextCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="next-h" className="grid gap-3">
      <h2 id="next-h" className="text-2xl">What next?</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.key} className="card flex flex-col gap-2 !p-4">
            <h3 className="text-lg">{c.title}</h3>
            <p className="flex-1 text-sm text-ivory/80">{c.text}</p>
            <div>{c.action}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface RecapData { title: string; heading: string; lines: string[]; avatar: AvatarConfig; nickname: string; footer: string }

/** Draws the recap onto a canvas (1080×1350). The avatar is the same drawing used everywhere else. */
export async function buildRecapPng(d: RecapData): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#04101d'); bg.addColorStop(0.6, '#0b3347'); bg.addColorStop(1, '#0d4658');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(242,184,88,.55)'; ctx.lineWidth = 6; ctx.strokeRect(36, 36, W - 72, H - 72);
  // Avatar
  const { avatarSvgMarkup } = await import('./avatarMarkup');
  const svg = avatarSvgMarkup(d.avatar, 'front', 420);
  const img = new Image();
  await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; });
  ctx.drawImage(img, W / 2 - 210, 150, 420, 490);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2b858'; ctx.font = '700 34px system-ui, sans-serif'; ctx.fillText(d.title.toUpperCase().slice(0, 36), W / 2, 110);
  ctx.fillStyle = '#f7f1e5'; ctx.font = '600 84px Georgia, serif'; ctx.fillText(d.heading.slice(0, 22), W / 2, 740);
  ctx.font = '500 44px system-ui, sans-serif'; ctx.fillStyle = 'rgba(247,241,229,.9)';
  d.lines.slice(0, 4).forEach((l, i) => ctx.fillText(l.slice(0, 40), W / 2, 830 + i * 72));
  ctx.fillStyle = '#f2b858'; ctx.font = '600 38px system-ui, sans-serif'; ctx.fillText(d.nickname.slice(0, 20), W / 2, 1160);
  ctx.fillStyle = 'rgba(247,241,229,.75)'; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(d.footer, W / 2, 1260);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? new Blob()), 'image/png'));
}

/** Share the recap as text/link (native share or copy) or save it as an image. */
export function RecapShare({ data, shareText, shareUrl }: { data: RecapData; shareText: string; shareUrl: string }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const share = async () => {
    const text = `${shareText}\n${shareUrl}`;
    if (navigator.share) { try { await navigator.share({ title: data.title, text: shareText, url: shareUrl }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(text); say('Copied — paste it anywhere'); } catch { say('Copy failed'); }
  };
  const image = async () => { setBusy(true); try { saveBlob(await buildRecapPng(data), 'elimquest-recap.png'); say('Image saved'); } catch { say('Could not make the image'); } finally { setBusy(false); } };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" className="!min-h-11 text-sm" onClick={share}>Share my result</Button>
      <Button variant="ghost" className="!min-h-11 text-sm" loading={busy} onClick={image}>Save as image</Button>
      <a className="btn btn-ghost !min-h-11 text-sm" href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp<span className="sr-only"> (opens a pre-filled message)</span></a>
      <span role="status" className="text-xs text-success">{msg}</span>
    </div>
  );
}

/** Weakest topic with enough questions to mean something (n ≥ 3); otherwise nothing — no invented advice. */
export function weakestTopic(breakdown: { category: string; total: number; correct: number }[]): { category: string; pct: number } | null {
  const ok = breakdown.filter((b) => b.total >= 3);
  if (!ok.length) return null;
  const w = [...ok].sort((a, b) => a.correct / a.total - b.correct / b.total)[0]!;
  return w.correct / w.total < 0.8 ? { category: w.category, pct: Math.round((w.correct / w.total) * 100) } : null;
}
