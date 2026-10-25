# Architecture & operating notes

```
Browser (React/Vite on Namecheap)  ──HTTPS──▶  Express API ─┐
        │  ▲                                                 ├─▶ PostgreSQL (Supabase)  ← authoritative
        └──WSS (Socket.IO)──────────────────▶ GameService ───┘
                                               (timers, scoring)   Redis: optional rate-limit counters only
```

## Authority and fairness
- The server owns phase, question, deadlines, accepted answers, steps, ranks, winners. Clients render and request.
- Round open → `deadline`. Answers are accepted while `now ≤ deadline + ANSWER_GRACE_MS (750 ms)`; the room closes the round after that. Submissions are persisted (`answers` unique on `(round, participant)`) **before** the ack. A retry of the same answer gets the original ack; a different second answer is rejected. Nothing is accepted after reveal.
- Scoring is one transaction guarded by the `closed → scored` transition (idempotent): outcomes, positions and win evaluation commit together. Summit winners = everyone at the summit in that round; limit-reached winners = everyone at the highest step; ranking is 1,1,3; no tie-break by speed/name.
- No answer keys are sent early: `round:open` carries text and options only; snapshots expose the key only after reveal. Per-player option order is a deterministic client shuffle from a round salt.
- Phase changes use a per-room serial queue. Events carry a version `v`; clients ignore stale events and re-request a snapshot on a gap or after reconnect.

## Hosting modes
Competing host = a player who can start/close voting/remove players in the lobby; cannot pause, void, end, announce, preview, or touch scores. Audience host = non-player controller (pause, resume, next, announce, void with reversal+replacement, remove, end early, preview, CSV). Custom packs force audience mode. Every management action is in `audit_events`.

## Identity
Guests: random 256-bit token stored hashed in `participants.token_hash`, sent in the socket `auth` / `X-Guest-Token` header, kept in `localStorage` per room. No cookies ⇒ no CSRF; XSS is the relevant risk (CSP, no HTML rendering of user text, nickname sanitising). Same token in two tabs = same participant; the DB constraint makes a second answer impossible. Expiry: with the room (24 h TTL, deleted per retention). Accounts: Supabase JWT verified server-side (`jose`, issuer + audience + JWKS); the platform role is read from `profiles`, never from the token.

## Crash / restart recovery
On boot, any game in countdown/question/reveal/paused becomes `recovery_pause` (visible banner everywhere). Nothing is auto-scored. On host Resume: an *open* round reopens with a **fresh full window** (already-accepted answers stay locked); a *closed-but-unscored* round is scored once; a scored round with a pending finale proceeds to finalisation; otherwise the next countdown starts. Tested (`recovery.test.ts`). A competing host may only use Resume for this case.

## Scaling
Single instance, single-process room ownership. A later multi-instance design needs room-ownership leases with fencing tokens, an adapter such as Redis Streams for Socket.IO, and sticky routing for polling — **not implemented and not safe to enable**.

## Retention
Cancelled/expired lobbies deleted after 7 days; finished games after 90; guest practice sessions after 30; deletion requests honoured within 30 days (manual process: `profiles.deletion_requested_at`).

## How to…
- **Change the brand/theme:** `packages/config/src/index.ts` (name, tagline, tokens, email footer) and the `@theme` block in `apps/web/src/index.css`; swap `public/favicon.svg` and `Emblem` in `components/Layout.tsx`; replace placeholder art components in `components/art.tsx`.
- **Add a non-Islamic category without exposing it:** Admin → Topics & levels → *Add topic* (starts **hidden**), import/author questions, review and publish them. Players only ever see published topics, so it stays invisible until you tick *publish*. No code branches are Islamic-specific; copy that mentions Islam (home hero) is in `packages/config`.
- **Raise room limits safely:** set `MAX_PLAYERS_PER_ROOM` (never above 150) and `MAX_ACTIVE_ROOMS` via env on Render only after running `tests/load/run.ts` against that deployment and recording p95 ack < 500 ms, no lost answers, result ≤ 2 s after deadline.
