import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errMsg, saveBlob } from '../lib/api';
import { Alert, Button, ErrorState, LinkButton, LiveRegion, PageLoading } from '../components/ui';

interface Share { title: string; code: string; codeDisplay: string; joinUrl: string; whenText: string; hostMode: string; topics: string[]; levelRange: number[]; rules: string[]; qr: string; message: string; whatsappUrl: string; ics: string | null; notice: string }

export default function SharePage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['share', id], queryFn: () => api<Share>('GET', `/api/games/${id}/share`) });
  const [copied, setCopied] = useState('');
  const resend = useMutation({ mutationFn: () => api<{ status: string }>('POST', `/api/games/${id}/resend-email`) });
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(`${what} copied`); } catch { setCopied('Copy failed — select the text manually'); }
    setTimeout(() => setCopied(''), 2500);
  };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: s.title, text: s.message, url: s.joinUrl }); } catch { /* cancelled */ } } else void copy(s.message, 'Invite'); };
  const hostPath = s.hostMode === 'audience' ? `/rooms/${s.code}/host` : `/join/${s.code}`;
  return (
    <div className="container-page grid max-w-4xl gap-6 py-8">
      <div><p className="eyebrow mb-1">Your room is open</p><h1 className="text-3xl">{s.title}</h1></div>
      <Alert tone="info">{s.notice}</Alert>
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="card flex flex-col items-center gap-2"><img src={s.qr} width={200} height={200} alt={`QR code that opens ${s.joinUrl}`} className="rounded-lg bg-white p-2" /><p className="text-sm text-ivory/70">Scan to join</p></div>
        <div className="card grid content-start gap-3">
          <div><p className="text-sm text-ivory/70">Room code</p><p className="font-display text-5xl tracking-[0.12em] text-amber" aria-label={`Room code ${s.code.split('').join(' ')}`}>{s.codeDisplay}</p></div>
          <div><p className="text-sm text-ivory/70">Join link</p><p className="break-all font-mono text-sm">{s.joinUrl}</p></div>
          <p className="text-sm">When: {s.whenText} · <em>The host starts the game.</em></p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => copy(s.message, 'Invite')}>Copy invite</Button>
            <Button variant="ghost" onClick={() => copy(s.joinUrl, 'Link')}>Copy link</Button>
            <Button variant="ghost" onClick={share}>Share…</Button>
            <a className="btn btn-ghost" href={s.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp<span className="sr-only"> (opens a pre-filled message; you press send)</span></a>
            {s.ics && <Button variant="ghost" onClick={() => saveBlob(new Blob([s.ics!], { type: 'text/calendar' }), 'elimquest.ics')}>Add to calendar</Button>}
          </div>
          <LiveRegion message={copied} />{copied && <p className="text-sm text-success">{copied}</p>}
        </div>
      </div>
      <section className="card grid gap-2" aria-labelledby="sum"><h2 id="sum" className="text-xl">What players will see</h2>
        <p className="text-sm text-ivory/80">Topics: {s.topics.join(', ') || 'Your private pack'} · Levels {s.levelRange[0]}–{s.levelRange[1]}</p>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-ivory/85">{s.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="text-xs text-ivory/60">No questions, answers, emails or player credentials appear in the shared preview.</p></section>
      <section className="card grid gap-2" aria-labelledby="mail"><h2 id="mail" className="text-xl">Confirmation email</h2>
        <p className="text-sm text-ivory/80">We email you the room details once when you create a game. We never email your audience — please share the link yourself.</p>
        <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" loading={resend.isPending} onClick={() => resend.mutate()}>Resend to me</Button>
          {resend.isSuccess && <span className="text-sm">{resend.data.status === 'logged_dev' ? 'Development mode: logged, not actually sent.' : resend.data.status === 'sent' ? 'Sent.' : resend.data.status}</span>}
          {resend.isError && <span className="text-sm text-danger">{errMsg(resend.error)}</span>}</div></section>
      <div className="flex flex-wrap gap-3"><LinkButton to={hostPath}>{s.hostMode === 'audience' ? 'Open host controls' : 'Enter the lobby'}</LinkButton><LinkButton variant="ghost" to="/dashboard">Back to dashboard</LinkButton><Link className="inline-flex min-h-11 items-center underline" to={`/games/${id}/edit`}>Edit settings</Link></div>
    </div>
  );
}
