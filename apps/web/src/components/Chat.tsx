import { useEffect, useRef, useState } from 'react';
import type { ChatMode, RoomSnapshot } from '@elimquest/contracts';
import type { RoomApi } from '../lib/useRoom';
import { AvatarFigure } from './Avatar';
import { Button } from './ui';

const BETWEEN = ['lobby', 'countdown', 'reveal', 'climb', 'paused', 'recovery_pause'];

/** Why the box is closed right now (null = the person can type). Mirrors the server's rules. */
function closedReason(snap: RoomSnapshot, mode: ChatMode, muted: boolean): string | null {
  if (snap.you.role === 'spectator') return 'Spectators can read the chat but not write.';
  if (muted) return 'The host has muted you in chat.';
  if (mode === 'off') return 'The host has turned chat off.';
  if (snap.phase === 'question_open' && mode !== 'always') return 'Chat reopens after this question, so nobody can share answers.';
  if (!BETWEEN.includes(snap.phase) && snap.phase !== 'question_open') return 'Chat is closed.';
  return null;
}

/** Room chat. Messages are only seen by people in this room, are never saved, and links/contact details are refused. */
export function ChatPanel({ room, snap, collapsible = false }: { room: RoomApi; snap: RoomSnapshot; collapsible?: boolean }) {
  const { chat } = room;
  const [open, setOpen] = useState(!collapsible);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const host = snap.you.canControl;
  const me = snap.you.participantId;
  const reason = closedReason(snap, chat.mode, chat.muted);
  const lastId = chat.messages[chat.messages.length - 1]?.id;

  useEffect(() => { if (open) room.markChatRead(); }, [open, lastId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = list.current; if (el && open && stick.current) el.scrollTop = el.scrollHeight; }, [lastId, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending || reason) return;
    setSending(true); setErr(null);
    const ack = await room.sendChat(t);
    setSending(false);
    if (ack.ok) setText(''); else setErr(ack.error ?? 'Could not send that message.');
  };
  const cmd = (c: string, extra: Record<string, unknown>) => { void room.host(c, extra).then((a) => { if (!a.ok) setErr(a.error ?? 'Could not do that.'); }); };

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg">Room chat</h2>
      {collapsible && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn btn-ghost !min-h-11 !px-3.5 text-sm">
          {open ? 'Hide' : 'Show'}{!open && chat.unread > 0 && <span className="ml-2 rounded-full bg-amber px-2 py-0.5 text-xs font-bold text-ink" aria-label={`${chat.unread} new messages`}>{chat.unread}</span>}
        </button>
      )}
    </div>
  );

  return (
    <section className="card grid gap-3 !p-4" aria-label="Room chat">
      {header}
      {open && (
        <>
          {host && (
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">When can players chat?</span>
              <select className="field" value={chat.mode} onChange={(e) => cmd('chatMode', { mode: e.target.value })}>
                <option value="between">Between questions (recommended)</option>
                <option value="always">Always open, even during questions</option>
                <option value="off">Off</option>
              </select>
            </label>
          )}
          <ol ref={list} role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat messages" tabIndex={0}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
            className="grid max-h-64 min-h-24 content-start gap-1.5 overflow-auto rounded-xl bg-ink p-2.5 text-sm">
            {chat.messages.length === 0 && <li className="text-ivory/65">{chat.mode === 'off' ? 'Chat is off.' : 'No messages yet. Say salaam!'}</li>}
            {chat.messages.map((m) => {
              const player = snap.players.find((p) => p.id === m.from);
              const mine = m.from === me && !!me;
              const muted = chat.mutedIds?.includes(m.from);
              return (
                <li key={m.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${mine ? 'bg-teal/20' : 'bg-white/5'}`}>
                  <span aria-hidden className="mt-0.5 shrink-0">{player ? <AvatarFigure config={player.avatar} size={28} /> : <span className="flex size-7 items-center justify-center rounded-full bg-amber text-xs font-bold text-ink">H</span>}</span>
                  <span className="min-w-0 flex-1 break-words">
                    <strong className="mr-1.5">{mine ? 'You' : m.nick}</strong>
                    {m.host && <span className="mr-1.5 rounded bg-amber/25 px-1.5 text-xs font-semibold text-amber">Host</span>}
                    <span>{m.text}</span>
                  </span>
                  {host && !mine && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" className="btn btn-ghost !min-h-11 !px-2.5 text-xs" aria-label={`Delete message from ${m.nick}`} onClick={() => cmd('chatDelete', { id: m.id })}>Delete</button>
                      {m.from !== 'host' && <button type="button" className="btn btn-ghost !min-h-11 !px-2.5 text-xs" aria-label={`${muted ? 'Unmute' : 'Mute'} ${m.nick}`} onClick={() => cmd('chatMute', { participantId: m.from, muted: !muted })}>{muted ? 'Unmute' : 'Mute'}</button>}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <form onSubmit={send} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="chat-text">Write a message</label>
            <input id="chat-text" className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" enterKeyHint="send"
              placeholder={reason ? 'Chat is closed right now' : 'Write a kind message…'} disabled={!!reason} aria-describedby="chat-help" />
            <Button type="submit" loading={sending} disabled={!!reason || !text.trim()}>Send</Button>
          </form>
          <p id="chat-help" className="text-xs text-ivory/70" role={err ? 'alert' : undefined}>{err ?? reason ?? 'Only people in this room can see messages, and they aren’t saved. No links or contact details. Be kind.'}</p>
        </>
      )}
    </section>
  );
}
