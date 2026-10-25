# Completion report (honest status)

**Verdict: a working, tested pilot-grade build. Not declared production-ready.** The multiplayer core, admin/content workflow, host modes and UI are implemented and verified locally. Real-provider integrations, real-device performance, reviewed content and final artwork are *not* verified/supplied (see §3–§5).

## 1. Evidence (all re-run at the end of this session)
| Check | Result |
|---|---|
| `vitest run` (10 files) | **109 passed** — game-core rules incl. super question, Gentle mode and tension cues; server integration with real Socket.IO + PGlite (game flow, recovery, content/permissions/RLS/import/packs, practice, scheduling, abuse, env, house rules, reveal charts, stickers, streak); web reducer + contrast |
| `playwright test` (Chromium) | **30 passed** — host setup on one screen with sign-in only at Create → auto-joined lobby with docked invite panel → 3 players incl. a 390 px phone → stickers, rejoin banner → real rounds → identical results + "What next?"; Quick climb tutorial; tile selectors; axe WCAG A/AA on 14 pages (0 serious/critical), 7 widths (320–1920) with no horizontal scroll and ≥40 px touch targets, 200 % zoom, landscape phone, skip link/keyboard, reduced motion |
| `tsc --noEmit` (server, web, 3 packages), `eslint` (web) | clean / 0 errors (48 advisory warnings) |
| Production build | web builds (home ≈ 74 KB gz JS, Phaser 357 KB gz lazy); server bundles to one 162 KB file; production mode **refuses** dev settings (tested) |
| Load harness 20/50/100/150 players | all answers accepted and persisted, 0 duplicates, 0 missing outcomes, p95 ack ≤ 80 ms — **local only, see `docs/CAPACITY.md` for why this is not a capacity proof** |

**Staircase performance (measured, headless Chromium, software GL, 390 px @2x DPR):** idle page ≈ 0.7–0.9 % of one core; the scene alone ≈ 0.3 %; the render loop sleeps when nothing moves. This is a relative measure on a desktop machine, **not** a real-phone result.

## 2. Requirement → status
**Added after the UX review:** intent-first landing that shows the same hall as the game, persistent adventurer, one-tap join, one-screen host setup with templates, docked invite panel, journey strip, coach tips, tile selectors, **Super question** (+2, one per game, announced) and **Gentle mode** as opt-in house rules, drawn sticker reactions, reveal charts, round highlights, tension cues, streak badge, shareable recap and a results-driven "What next?" strip.

**Implemented and tested:** guest join by code/link with nickname+avatar; accounts (Supabase adapter + dev auth); competing and audience hosting; private packs (forced audience mode) with CSV import; reviewed-question selection (publication-only, versioned snapshots, no same-match repeat, history freshness, shortage flow with remedies, reuse consent); wizard (6 steps, drafts, inventory, shortage messaging); scheduled rooms that never auto-start (manual early start with warning); room code/link/QR/native share/copy/WhatsApp link/ICS; atomic 150-player cap and spectator budget; server-authoritative rounds with shared deadline, +1/−1/floor-0 scoring, summit and limit endings, joint winners, 1-1-3 ranking, void with reversal+replacement+audit, finale review window, pause/resume/next/announce/remove/end-early; idempotent answers, duplicate/conflict/stale/late handling; reconnection and one-identity-across-tabs; crash recovery pause with fair resume (open and closed-unscored rounds); results with review, rematch, mistake practice, guest→account linking, audience CSV (formula-safe); solo practice (same scoring); topic voting with deterministic quotas; admin (overview, question CRUD, import with preview, review queue with author≠approver, topics/levels, reports, audit, roles/platform); RLS + readiness trigger; rate limits; payload caps; CSP/CORS/helmet; env validation.

**Implemented but only partly verified:** the Phaser staircase (renders and animates in headless Chromium with software GL; HTML fallback verified; **real-phone performance unmeasured**); host console UI, topic-voting UI, pack editor UI, admin UI, practice UI, account page, and the browser-side reconnect banner (built and type-checked; server behaviour tested; not driven by browser tests except `/practice` setup axe); XLSX import (code path present, only CSV exercised); sound (synth, untested by ear).

**Not implemented / deferred:** public-pack review submission (§9.15), answer-statistics level-misclassification flags (§10), automated account-deletion execution (manual flag only), metrics/alerting, preset reactions (optional), multi-instance scaling (intentionally not built), Redis streams adapter, timed host reminders and audience emails (explicitly out of scope).

## 3. Unverified integrations (code written, never run against the real service)
Supabase Auth (JWKS verification, sign-up, verification email, password reset, callback), Supabase Postgres via the `pg` driver (SQL is shared with the tested PGlite path, but pooling/SSL/`for update` behaviour on Supabase is untested), Brevo REST + Supabase SMTP, Redis counters, Render deployment, Namecheap `.htaccess` + CSP.

## 4. Known limitations
- Capacity: only the local numbers above. 150 players is a ceiling, not a promise; keep public rooms smaller (`render.yaml` starts at 50) until measured on your stack. Render Free sleeps.
- Single server instance; a restart pauses live games until the host resumes (by design).
- Authenticated pages were not axe-scanned; keyboard/screen-reader behaviour was not tested with a real screen reader.
- The mobile landing hero art is partly covered by the join panel (placeholder composition).
- Policy pages are drafts for owner/legal review; no compliance claims are made.
- Rate limits and caps use in-memory counters unless Redis is configured.

## 5. What you must supply
1. **Reviewed questions** (the 50 fixtures are unreviewed, flagged, and unplayable in production). Import via Admin, review (second reviewer), publish.
2. **Artwork** per `docs/ASSETS.md` (hero ×2, staircase + tread data, avatars if you want illustrated ones, category art, emblem, optional sound).
3. **Accounts/credentials:** Supabase project (URL, anon key, pooled DB URL), Brevo API key + verified sender, Render service, Namecheap hosting confirmed, optional Redis URL. Real contact email and policy review.
4. Authorisation to deploy; a real low-end Android phone for performance checks; a staging load test (see CAPACITY.md).

## 6. Decisions you may want to revisit
`docs/DECISIONS.md` (D1–D18), notably: non-human avatars override the spec's "stylised humans"; 750 ms answer grace; guest tokens in `localStorage`/headers (no cookies); PGlite for dev/test; recovery resumes with a fresh full window.
