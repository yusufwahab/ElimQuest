# Deployment guide (nothing here has been executed against real providers)

You must supply accounts, credentials and a go-ahead. This repository never deploys, purchases or upgrades anything.
Verify current provider limits (Render Free, Supabase Free, Redis, Brevo) before relying on any number below.

## 1. Supabase (database + auth)

1. Create a project in the region nearest your players. Note `Project URL`, the **anon/publishable key** (public) and the **pooled connection string** (Settings → Database). Never put the `service_role` key or DB password in any `VITE_` variable.
2. Run migrations (from a trusted machine): 
   ```bash
   DB_DRIVER=pg DATABASE_URL='postgres://…' NODE_ENV=production AUTH_MODE=supabase SUPABASE_URL=https://REF.supabase.co npm run migrate -w @elimquest/server
   ```
   This applies `database/migrations/*.sql` (RLS enabled on every table; browser roles get no table access except published categories). Rollback: `database/migrations/0001_init.down.sql` (**destructive**; export first).
3. Auth → URL configuration: Site URL = your web origin; add `https://your-domain/auth/callback` and `/reset-password` to redirect URLs. Enable email confirmations.
4. Auth → SMTP: point Supabase's custom SMTP at Brevo (Brevo → SMTP & API → SMTP keys; sender must be verified). Send a real test sign-up and password reset — **this repo could not test it**.
5. First super admin (public sign-up never grants roles): sign in once, then
   `NODE_ENV=production DB_DRIVER=pg DATABASE_URL=… AUTH_MODE=supabase SUPABASE_URL=… npx tsx apps/server/src/db/grant-role.ts you@example.com super_admin`.
6. **Do not seed fixtures.** Production starts with zero playable questions until reviewed content is published (the UI then shows "Only 0 suitable questions"). Load content via Admin → Import → review → publish.

JWT verification uses the project's JWKS by default (`SUPABASE_JWT_SECRET` only for legacy HS256 projects). **Unverified:** I could not test against a real Supabase project; run the checklist in §6.

## 2. Render (API + Socket.IO)

Use `render.yaml` or the dashboard: Node web service, build `npm ci && npm run build -w @elimquest/server`, start `node apps/server/dist/index.mjs`, health check `/readyz`. Set env vars from `apps/server/.env.example` (secrets only in the dashboard). `ALLOWED_ORIGINS` must be your exact web origin(s).

- **Free plan sleeps** when idle and has limited resources. The UI shows "waking up" states; hosts should open the room several minutes before a gathering. Do not generate artificial traffic to keep it awake.
- One instance only (game controller is single-process; see ARCHITECTURE "Scaling"). Do not enable multiple instances.
- Graceful shutdown: SIGTERM stops timers; in-flight games enter **recovery pause** on next boot and a host presses Resume.
- Start with `MAX_PLAYERS_PER_ROOM=50`, `MAX_ACTIVE_ROOMS=2` until you have run `tests/load` against *your* deployed stack from realistic locations.

## 3. Brevo

Create an API key (server only) and verify the sender. Set `EMAIL_MODE=brevo`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`. The app only sends one host confirmation per game (idempotent via `email_log`) plus Supabase's own auth mail; reserve quota for password recovery. Failures never block game creation; hosts get a "Resend" button (3/hour).

## 4. Redis (optional)

Only rate-limit counters use it (one INCR + PEXPIRE per limited request). Without `REDIS_URL` the single-instance in-memory counter is used (the tested mode). Redis outage degrades to that counter and never fails open. Measure command usage against your plan before enabling.

## 5. Namecheap (static frontend)

Confirm your plan includes **hosting**, not only a domain.
1. Build with production values:
   `VITE_API_URL=https://your-api.onrender.com VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… VITE_BASE_PATH=/ npm run build -w @elimquest/web`
2. Edit `apps/web/dist/.htaccess` (copied from `public/`): replace `YOUR-API.onrender.com` in the CSP `connect-src`; if deploying under a sub-directory also set `VITE_BASE_PATH=/sub/` at build time and `RewriteBase /sub/`.
3. cPanel → File Manager → upload the **contents** of `dist` into the document root (e.g. `public_html`), including the hidden `.htaccess`. Enable AutoSSL; the file forces HTTPS.
4. Verify: `/join/123456` loads the app on refresh (SPA fallback) while `/assets/does-not-exist.js` returns a real 404. **The CSP and rewrite rules were written but not run on Apache here.**

## 6. Go-live checklist (all must be true before public use)

- [ ] Real sign-up, email verification and password reset work end to end via Supabase + Brevo.
- [ ] A super admin exists; reviewed questions are published (Admin → Overview shows published counts ≥ question limit per topic).
- [ ] `/readyz` is green on Render; CORS only allows your web origin; websocket connects from the Namecheap site.
- [ ] Load test run against the deployed stack at your intended room size, results recorded in `docs/CAPACITY.md`.
- [ ] Tested on at least one real lower-end Android phone (not done here).
- [ ] Privacy/Terms drafts reviewed by the owner (and a lawyer if required).
- [ ] Final artwork per `docs/ASSETS.md` replaces placeholders.

## 7. Backups

Supabase Free has **no automated backups you can rely on** (verify your plan). Take manual dumps before each migration and weekly:
`pg_dump "$DATABASE_URL" --no-owner -Fc -f elimquest-$(date +%F).dump`; restore with `pg_restore --clean --if-exists -d "$TARGET_URL" file.dump` into a scratch project first. Rehearse a restore before you need it.
