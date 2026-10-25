# Capacity — what was and was not measured

**There is no production capacity claim.** 150 players per room is a configured ceiling, not a proven limit. Public 150-player rooms should stay disabled (`MAX_PLAYERS_PER_ROOM` lowered) until you measure your own deployment.

## What was run (local, this repository's harness: `tests/load/run.ts`)

Real `socket.io-client` connections over websockets; every bot answers in the final ~350 ms before the deadline (burst); 6 s windows (`TIMING_SCALE=0.2`), 5 rounds, 750 ms grace. Raw outputs: `docs/load-results/`.

| Players (+spectators) | Answers accepted | p50 / p95 / p99 ack (ms) | Result after deadline p95 (ms)* | Duplicates in DB | Missing outcomes | Disconnects |
|---|---|---|---|---|---|---|
| 20 | 120/120 | 5 / 11 / 35 | 785 | 0 | 0 | 0 |
| 50 | 250/250 | 6 / 12 / 13 | 794 | 0 | 0 | 0 |
| 100 | 500/500 | 9 / 31 / 72 | 803 | 0 | 0 | 0 |
| 150 (+10 spectators, +host) | 750/750 | 14 / 80 / 86 | 801 | 0 | 0 | 0 |

\* includes the 750 ms answer grace; processing after the grace is ≈ 50 ms. Server process peak RSS ≈ 0.4–0.7 GB (includes PGlite and the in-process clients); event-loop delay p99 ≈ 20–26 ms, max ≈ 0.1–0.33 s.

Against the spec's targets (p95 ack < 500 ms, no lost accepted answers, no double scoring, results within 2 s of deadline) these local runs pass, **but**:

## Why this is not evidence for production
- Database was **PGlite** (single-connection WASM Postgres), not Supabase over a network. Real DB latency, pooling limits and free-tier throttling are untested.
- Clients and server shared one machine and one core budget; **no network latency, jitter, mobile radios, TLS or proxy** were involved.
- Only one room at a time; **no multi-room, no reconnect storm, no 20–30-round soak** was run. Redis was not used. Render Free limits (CPU/RAM/sleep) were not exercised.
- Short windows (`TIMING_SCALE=0.2`) compress timing; the real 30 s windows spread load more but were not run at scale.
- No measurement on a real low-end Android phone (Phaser scene performance is **unmeasured**; headless Chromium used software rendering).

## Before enabling large rooms
Run the harness from a separate machine against the deployed API at your target size, with `TIMING_SCALE=1` for at least one full-length game, plus a reconnect storm (kill and restore connections mid-round) and two rooms at once; record CPU/memory from Render metrics and DB pool use from Supabase; then set the limits accordingly.
