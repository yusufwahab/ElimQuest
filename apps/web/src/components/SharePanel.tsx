import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errMsg, saveBlob } from '../lib/api';
import { Alert, Button, LiveRegion } from './ui';

interface Share { title: string; code: string; codeDisplay: string; joinUrl: string; whenText: string; qr: string; message: string; whatsappUrl: string; ics: string | null; notice: string }

/** Everything a host needs to bring people in, docked in the lobby / host console (no separate page to find). */
export function SharePanel({ gameId, defaultOpen = true }: { gameId: string; defaultOpen?: boolean }) {
  const q = useQuery({ queryKey: ['share', gameId], queryFn: () => api<Share>('GET', `/api/games/${gameId}/share`), retry: 1 });
  const [copied, setCopied] = useState('');
  const resend = useMutation({ mutationFn: () => api<{ status: string }>('POST', `/api/games/${gameId}/resend-email`) });
  if (q.isPending) return <p className="text-sm text-ivory/70">Loading invite…</p>;
  if (q.isError) return <Alert tone="error">{errMsg(q.error)}</Alert>;
  const s = q.data;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(`${what} copied`); } catch { setCopied('Copy failed — select the text manually'); }
    setTimeout(() => setCopied(''), 2500);
  };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: s.title, text: s.message, url: s.joinUrl }); } catch { /* cancelled */ } } else void copy(s.message, 'Invite'); };
  return (
    <details open={defaultOpen} className="card !p-0">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-lg font-semibold">Invite people <span className="text-xs font-normal text-ivory/70">{s.codeDisplay}</span></summary>
      <div className="grid gap-3 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-4">
          <img src={s.qr} width={132} height={132} alt={`QR code that opens ${s.joinUrl}`} className="rounded-lg bg-white p-1.5" />
          <div className="grid min-w-0 flex-1 gap-1"><p className="text-xs text-ivory/70">Join link</p><p className="break-all font-mono text-xs">{s.joinUrl}</p><p className="text-xs text-ivory/70">{s.whenText}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="!min-h-11 text-sm" onClick={() => copy(s.message, 'Invite')}>Copy invite</Button>
          <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => copy(s.joinUrl, 'Link')}>Copy link</Button>
          <Button variant="ghost" className="!min-h-11 text-sm" onClick={share}>Share…</Button>
          <a className="btn btn-ghost !min-h-11 text-sm" href={s.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp<span className="sr-only"> (opens a pre-filled message; you press send)</span></a>
          {s.ics && <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => saveBlob(new Blob([s.ics!], { type: 'text/calendar' }), 'elimquest.ics')}>Add to calendar</Button>}
        </div>
        <LiveRegion message={copied} />{copied && <p className="text-sm text-success">{copied}</p>}
        <p className="text-xs text-ivory/65">{s.notice}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs"><button className="min-h-11 underline" disabled={resend.isPending} onClick={() => resend.mutate()}>Resend confirmation email to me</button>{resend.isSuccess && <span>{resend.data.status === 'logged_dev' ? 'Dev mode: logged, not sent.' : resend.data.status === 'sent' ? 'Sent.' : resend.data.status}</span>}{resend.isError && <span className="text-danger">{errMsg(resend.error)}</span>}</div>
      </div>
    </details>
  );
}
