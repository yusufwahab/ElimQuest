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

## 1b. Sign-up with an emailed one-time code (our own OTP, sent through Brevo)

How it works: on the sign-up page the person enters name + email → **our API** emails a 6-digit code through **Brevo's API** (10-minute life, single use, locks after 5 wrong tries, 30 s resend cooldown, max 5 codes/hour/address) → they enter the code and choose a password → **only then** the API creates the account in Supabase, already confirmed. Nothing is created for an unproven email. Codes are stored only as a keyed hash (`OTP_SECRET`).

**Required one-time setup**
1. **Supabase → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".** Otherwise anyone could skip the code check by calling Supabase directly with the public key. (Existing users and the server's admin API are unaffected.) Keep the **Email** provider enabled — people still sign in with email + password.
2. **Server env (Render):** `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API → *service_role*; **secret, server-only — never a `VITE_` variable, never in Git**) and `OTP_SECRET` (32+ random characters, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). In production the server refuses to start without both.
3. **Brevo:** `EMAIL_MODE=brevo`, `BREVO_API_KEY`, and `BREVO_SENDER_EMAIL` — the sender must be **verified in Brevo** (Senders & IP → Senders). For reliable inbox delivery also authenticate your domain (Brevo → Senders → Domains: add the DKIM/SPF records at your DNS host).
4. **Password-reset emails** are still sent by Supabase. To send them through Brevo too: Supabase → Authentication → **SMTP Settings** → enable custom SMTP: host `smtp-relay.brevo.com`, port `587`, username = your Brevo SMTP login, password = a Brevo **SMTP key** (Brevo → SMTP & API → SMTP; this is *not* the API key), sender = the same verified address. Without this Supabase uses its own very limited sender.

In local development (`AUTH_MODE=dev`, `EMAIL_MODE=log`) no email is sent: the code is printed in the server log and shown on the sign-up page, clearly marked as development-only. That helper endpoint (`/api/dev/last-email`) does not exist in production.

## 2. Render (API + Socket.IO)

**Quick settings (Render → New → Web Service → connect the repo; or use `render.yaml` as a Blueprint):**

| Setting | Value |
|---|---|
| Runtime | Node |
| Root directory | *(leave empty — the repo root)* |
| Build command | `npm install --include=dev --no-audit --no-fund && npm run build -w @elimquest/server` |
| Start command | `node apps/server/dist/index.mjs` |
| Health check path | `/readyz` |
| Plan | Free to test; a paid always-on plan for real events |
| Auto-deploy | Off (deploy deliberately) |

Why `npm install` and not `npm ci`: the lockfile was generated on Windows and lacks some Linux-only optional packages (`lightningcss-*`, `@rolldown/binding-*`), so `npm ci` stops with *"Missing … from lock file"* on Render (npm bug #4828). `npm install` fills them in on the server.

Environment variables: copy the names from `apps/server/.env.production.example` into Render's Environment tab and fill in the blanks. The server refuses to start in production with dev settings (fixtures, dev auth, PGlite, scaled timing, disabled rate limits). On every boot it applies any pending database migrations automatically (safe to repeat). One instance only.

Use `render.yaml` or the dashboard: Node web service, build `npm ci && npm run build -w @elimquest/server`, start `node apps/server/dist/index.mjs`, health check `/readyz`. Set env vars from `apps/server/.env.example` (secrets only in the dashboard). `ALLOWED_ORIGINS` must be your exact web origin(s).

- **Free plan sleeps** when idle and has limited resources. The UI shows "waking up" states; hosts should open the room several minutes before a gathering. Do not generate artificial traffic to keep it awake.
- One instance only (game controller is single-process; see ARCHITECTURE "Scaling"). Do not enable multiple instances.
- Graceful shutdown: SIGTERM stops timers; in-flight games enter **recovery pause** on next boot and a host presses Resume.
- Start with `MAX_PLAYERS_PER_ROOM=50`, `MAX_ACTIVE_ROOMS=2` until you have run `tests/load` against *your* deployed stack from realistic locations.

## 3. Brevo

Create an API key (server only) and verify the sender. Set `EMAIL_MODE=brevo`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`. The app only sends one host confirmation per game (idempotent via `email_log`) plus Supabase's own auth mail; reserve quota for password recovery. Failures never block game creation; hosts get a "Resend" button (3/hour).

## 4. Redis (optional)

Only rate-limit counters use it (one INCR + PEXPIRE per limited request). Without `REDIS_URL` the single-instance in-memory counter is used (the tested mode). Redis outage degrades to that counter and never fails open. Measure command usage against your plan before enabling.

## 5. Frontend on Vercel + a Namecheap .com (recommended)

Vercel serves the built static app. The API stays on Render (Vercel cannot proxy websockets, so the browser talks to the API directly).

1. **Import the repo** in Vercel (New Project). "Root Directory" can be the repo root (uses `/vercel.json`) **or** `apps/web` (uses `apps/web/vercel.json`, which installs and builds from the repo root and outputs `dist`); both give the same result. `vercel.json` sets: install `npm install`, build `npm run build -w @elimquest/web`, output `apps/web/dist`, the SPA fallback (refreshing `/join/123456` works while a missing `/assets/x.js` stays a real 404), cache headers and security headers. Set the project's **Node.js version to 22.x**.
2. **Environment variables** (Project → Settings → Environment Variables, Production): `VITE_API_URL=https://api.yourdomain.com` (or your `*.onrender.com` URL), `VITE_SOCKET_URL` (optional, defaults to the API URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Only public values — never a secret. Redeploy after changing them (they are baked in at build time).
3. **Add your domain**: Project → Settings → Domains → add `yourdomain.com` and `www.yourdomain.com`. Vercel shows the exact DNS records to create — copy those, not any example from this file.
4. **Point Namecheap at Vercel**: Namecheap → Domain List → Manage → **Advanced DNS**. Delete the default parking records, then add the records Vercel displays (typically an `A` record for `@` and a `CNAME` for `www`). Alternatively switch the domain to Vercel's nameservers. DNS can take minutes to hours; Vercel issues HTTPS automatically once it resolves.
5. **API subdomain** (optional but tidy): add `api.yourdomain.com` as a custom domain on the Render service and create the `CNAME` Render tells you in Namecheap Advanced DNS.
6. **Tell the backend about the new origin** (Render env vars): `ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com` and `PUBLIC_WEB_URL=https://yourdomain.com` (used in invite links, QR codes and emails). In Supabase Auth → URL configuration set the Site URL and add `https://yourdomain.com/auth/callback` and `/reset-password`.
7. **Tighten the CSP** once it all works: in `vercel.json` change `connect-src 'self' https: wss:` to your exact API and Supabase origins (e.g. `connect-src 'self' https://api.yourdomain.com wss://api.yourdomain.com https://YOURREF.supabase.co`). It ships permissive on purpose so a forgotten placeholder can't block the app.

Notes: Vercel's free **Hobby** plan is for personal, non-commercial use — if this is a business/organisation project you need a paid plan (check current terms). The `.htaccess` in `apps/web/public` is only for Apache hosts and is harmless on Vercel. **Unverified here:** the Vercel deploy, DNS, and the CSP in a real browser against the deployed API (the Phaser scene has only been tested with the dev server).

## 5b. Alternative: Namecheap shared hosting (static)

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
