import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, ChatMode, ChatState, ReactionKind, RoomSnapshot, ServerEvent } from '@elimquest/contracts';
import { SOCKET_URL } from './api';
import { getAccessToken } from './auth';
import { initialRoomState, roomReducer, type RoomState } from './roomState';
import { roomCred } from './storage';

type Ack<T = unknown> = { ok: boolean; error?: string; code?: string; data?: T };

export interface RoomApi {
  state: RoomState;
  select(optionId: string): void;
  submit(): Promise<string | null>;
  host(cmd: string, extra?: Record<string, unknown>): Promise<Ack>;
  vote(categoryIds: string[]): Promise<Ack>;
  resync(): void;
  react(kind: ReactionKind): Promise<Ack>;
  /** Sticker bursts waiting to be shown; call `dismissReaction(key)` when an animation ends. */
  reactions: { key: number; id: string; kind: ReactionKind }[];
  dismissReaction(key: number): void;
  /** Room chat: the last messages, whether it is open to everyone, and whether the host muted you. */
  chat: ChatState & { unread: number };
  sendChat(text: string): Promise<Ack>;
  markChatRead(): void;
}

/** Owns the socket for one room. Live state lives in a reducer; it is never mirrored into a query cache. */
export function useRoom(code: string): RoomApi {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState);
  const sock = useRef<Socket | null>(null);
  const [reactions, setReactions] = useState<{ key: number; id: string; kind: ReactionKind }[]>([]);
  const reactionKey = useRef(0);
  const [chat, setChat] = useState<ChatState>({ mode: 'between', messages: [], muted: false });
  const [readSeq, setReadSeq] = useState(0);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const fetchSnapshot = useCallback(() => {
    const s = sock.current;
    if (!s?.connected) return;
    s.timeout(8000).emit('chat:sync', null, (err: unknown, ack: Ack<ChatState>) => { if (!err && ack?.ok && ack.data) setChat(ack.data); });
    s.timeout(8000).emit('snapshot', null, (err: unknown, ack: Ack<RoomSnapshot>) => {
      if (err || !ack) return;
      if (ack.ok && ack.data) dispatch({ type: 'snapshot', snap: ack.data, receivedAt: Date.now() });
      else if (ack.code === 'removed') dispatch({ type: 'conn', conn: 'removed' });
      else dispatch({ type: 'conn', conn: 'denied', reason: ack.error });
    });
  }, []);

  useEffect(() => {
    const cred = roomCred.get(code);
    const socket = io(SOCKET_URL, {
      auth: (cb) => { void getAccessToken().then((accessToken) => cb({ code, token: cred?.token, accessToken })); },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    sock.current = socket;
    socket.on('connect', fetchSnapshot);
    socket.on('ev', (ev: ServerEvent) => dispatch({ type: 'event', ev }));
    socket.on('reactions', (p: { items: { id: string; kind: ReactionKind }[] }) => setReactions((cur) => [...cur, ...p.items.map((i) => ({ ...i, key: ++reactionKey.current }))].slice(-14)));
    socket.on('chat', (m: ChatMessage) => setChat((c) => (c.messages.some((x) => x.id === m.id) ? c : { ...c, messages: [...c.messages, m].slice(-100) })));
    socket.on('chat:del', (p: { id: string }) => setChat((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== p.id) })));
    socket.on('chat:mode', (p: { mode: ChatMode }) => setChat((c) => ({ ...c, mode: p.mode })));
    socket.on('chat:muted', (p: { participantId: string; muted: boolean }) => setChat((c) => ({
      ...c,
      muted: p.participantId === stateRef.current.snap?.you.participantId ? p.muted : c.muted,
      ...(c.mutedIds ? { mutedIds: p.muted ? [...new Set([...c.mutedIds, p.participantId])] : c.mutedIds.filter((x) => x !== p.participantId) } : {}),
    })));
    socket.on('rematch', (p: { code: string }) => dispatch({ type: 'rematch', code: p.code }));
    socket.on('disconnect', (reason) => { if (reason !== 'io client disconnect') dispatch({ type: 'conn', conn: 'reconnecting' }); });
    socket.on('connect_error', (e) => {
      if (['not_member', 'not_found', 'bad_code'].includes(e.message)) { socket.disconnect(); dispatch({ type: 'conn', conn: 'denied', reason: e.message }); }
      else if (e.message === 'room_connections_full') { socket.disconnect(); dispatch({ type: 'conn', conn: 'denied', reason: e.message }); }
      else dispatch({ type: 'conn', conn: 'reconnecting' });
    });
    // Pause work when the tab is hidden; resync on return (timers are server-owned, so nothing is lost).
    const vis = () => { if (!document.hidden) fetchSnapshot(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); socket.removeAllListeners(); socket.disconnect(); sock.current = null; };
  }, [code, fetchSnapshot]);

  useEffect(() => { if (state.gap) fetchSnapshot(); }, [state.gap, fetchSnapshot]);

  const emit = useCallback(function send(ev: string, payload?: unknown, retries = 0): Promise<Ack> {
    return new Promise((resolve) => {
      const s = sock.current;
      if (!s) return resolve({ ok: false, error: 'Not connected' });
      s.timeout(5000).emit(ev, payload, (err: unknown, ack: Ack) => {
        if (err) { if (retries > 0) return void send(ev, payload, retries - 1).then(resolve); return resolve({ ok: false, code: 'timeout', error: 'The server didn’t respond. Check your connection.' }); }
        resolve(ack);
      });
    });
  }, []);

  return {
    state,
    select: (optionId) => dispatch({ type: 'select', optionId }),
    async submit() {
      const st = stateRef.current;
      const q = st.snap?.question;
      if (!q || !st.selection || st.snap?.myAnswerAccepted) return null;
      dispatch({ type: 'sending', value: true });
      // Submitting is idempotent server-side, so a lost acknowledgement can be retried safely.
      const ack = await emit('answer', { roundId: q.roundId, optionId: st.selection }, 2);
      if (ack.ok) { dispatch({ type: 'accepted', optionId: st.selection }); return null; }
      if (ack.code === 'already_answered') { dispatch({ type: 'accepted', optionId: ((ack.data as { optionId?: string })?.optionId) ?? st.selection }); return null; }
      dispatch({ type: 'sending', value: false });
      return ack.error ?? 'Could not send your answer';
    },
    host: (cmd, extra) => emit('host', { cmd, ...extra }),
    vote: (categoryIds) => emit('vote', { categoryIds }),
    resync: fetchSnapshot,
    react: (kind) => emit('react', { kind }),
    reactions,
    chat: { ...chat, unread: chat.messages.filter((m) => Number(m.id) > readSeq && m.from !== stateRef.current.snap?.you.participantId).length },
    sendChat: (text) => emit('chat:send', { text }),
    markChatRead: () => setReadSeq(Number(chat.messages[chat.messages.length - 1]?.id ?? 0)),
    dismissReaction: (key) => setReactions((cur) => cur.filter((r) => r.key !== key)),
  };
}
