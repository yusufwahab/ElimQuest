# Operations & incident runbook

## Before a live event (host checklist)
1. Open the room 5–10 minutes early (wakes a sleeping free-tier server).
2. Share the link/QR yourself (ElimQuest never messages your audience). Check the lobby shows everyone.
3. Competing host: you cannot see questions or change scores. Audience host: use Pause between rounds, Void for a faulty question (during the question or the short review window after a reveal), End only if you must (results will say "Ended early").

## Incidents
| Symptom | What it means | Action |
|---|---|---|
| Yellow "Game paused — server restarted" | Process restarted; nothing was scored unfairly | Host presses **Resume**. An open question restarts with a full timer; already-submitted answers stay locked. |
| Players "Reconnecting…" | Their network or the server is waking | They just wait; same browser rejoins as the same player. Hosts can reload. |
| "Only N suitable questions" | Not enough *reviewed, unseen* questions for those settings | Reduce questions, broaden topics/levels, or allow recently used questions. Admins: publish more content. |
| Faulty question discovered | | Audience host → **Void this question** (reversal + replacement; audited). After the finale is confirmed results are immutable except by an audited admin correction done directly in the database (no live UI by design). |
| Email didn't arrive | Brevo failure/quota | Game still exists. Share page → *Resend to me* (3/hour). Check Brevo logs. |
| Room full / connection limit | `MAX_PLAYERS_PER_ROOM` or the spectator budget | Raise only with load-test evidence (docs/CAPACITY.md). |

## Observability
Logs go to stdout (no request bodies, answers or tokens are logged). `GET /healthz` (liveness), `GET /readyz` (DB check). Admin → Roles & platform shows live limits and live room count; Admin → Audit log lists role grants, publication changes, voids, host actions and game start/finish. **Not implemented:** metrics export, alerting, error aggregation (add Sentry/Logtail or Render alerts before public launch).

## Data
Retention is implemented by `GameService.sweep()` (every 10 minutes): see ARCHITECTURE. Account deletion is a request flag (`profiles.deletion_requested_at`); executing it is a manual DB task today — **not automated**.

## Backups/restore
See DEPLOY §7. Free-plan backups are not assumed.
