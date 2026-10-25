# ElimQuest

Islamic knowledge quiz played on a shared animated staircase. Players answer the same question each round; right answers climb, wrong or missed answers step down; the first to the summit wins (ties are shared). Name, colours and brand are placeholders centralised in `packages/config`.

> **Status: working pilot-grade build, not declared production-ready.** See `docs/COMPLETION_REPORT.md` for what is verified, what is not, and what you must supply (reviewed questions, final artwork, Supabase/Brevo/Render/Namecheap credentials).

## Layout

| Path | What |
|---|---|
| `apps/web` | React + Vite + Tailwind v4 + React Router + TanStack Query + Phaser (lazy) |
| `apps/server` | Express + Socket.IO + Zod + `jose`; PostgreSQL via `pg` (prod) or PGlite (dev/test) |
| `packages/game-core` | Pure rules: scoring, ranking, phases, selection, avatars, nicknames |
| `packages/contracts` | Zod schemas + DTO types shared by web and server |
| `packages/config` | Brand and theme tokens, platform limits |
| `database/migrations` | SQL migrations (+ `.down.sql`), `database/dev` = dev-only SQL |
| `tests/` | `e2e` (Playwright), `load` (Socket.IO harness), `tools` (visual QA, probe) |
| `docs/` | Architecture, deploy, ops, capacity, assets, decisions, completion report |

## Run locally (no accounts or credentials needed)

```bash
npm install                      # Node >= 22
cp apps/server/.env.example apps/server/.env     # optional; defaults work
npm run dev:server               # API + Socket.IO on :8787, in-memory PGlite, seeded fixtures, dev auth
npm run dev:web                  # http://localhost:5173 (proxies /api and /socket.io)
```

Dev accounts (dev auth only, refused in production): `admin@dev.local`, `reviewer@dev.local`, `host@dev.local`, password `devpassword1`.
Fixture questions are **unreviewed placeholders**; they are only selectable with `ALLOW_FIXTURE_QUESTIONS=true` (set it in your local `.env`).

> If `vitest`/`vite` fails with *Cannot find native binding*, that is npm bug #4828. The root `package.json` pins `@rolldown/binding-win32-x64-msvc` as an optional dependency; on macOS/Linux run `npm i --no-save @rolldown/binding-<your-platform>@<rolldown version>`.

## Tests

```bash
npm test                         # unit + integration (vitest): game-core, server (real sockets + PGlite), web reducer
npm run build -w @elimquest/web  # required before e2e
npm run test:e2e                 # Playwright: full UI journey, tutorial, axe accessibility, responsive widths (set E2E_API_PORT / E2E_WEB_PORT to avoid stale servers)
npx tsx tests/load/run.ts 150 5 0.2 10   # Socket.IO load harness (players, rounds, timeScale, spectators)
npm run typecheck && npm run lint
```

## Deploy

`docs/DEPLOY.md` (Namecheap static frontend, Render API, Supabase, Brevo, migrations, rollback, backups). Nothing is deployed by this repository; deployment needs your explicit action and credentials.
