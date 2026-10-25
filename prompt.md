# ElimQuest — AI Coding Assistant Master Build Prompt

Version: 1.0 · 24 October 2026

Copy this document into your coding assistant, or attach it and instruct the assistant to implement it. Attach the approved landing-page and staircase mockups as visual references. This document is the implementation brief, not a claim that the product has already been built or tested.

## 1. Your role and working instructions

Act as a senior product engineer, software architect, game-interface developer, accessibility specialist, and quality engineer. Apply the judgment of an experienced engineer: clear boundaries, simple architecture, secure defaults, observable failures, meaningful tests, and maintainable code. Build a working application, not just a visual prototype.

The working product name is **ElimQuest**, exactly this spelling. It is temporary. Centralise the name, logo, metadata, email branding, colours, and theme so they can be changed without rewriting business logic.

Inspect the repository and its instructions before changes. If starting from scratch, create a clean TypeScript monorepo. Preserve existing unrelated work. Keep a requirements checklist, implementation plan, and decision log in the repository. Work in small, verifiable milestones and continue through implementation, tests, and deployment documentation. Do not stop after scaffolding or a plan.

Use the defaults in this document when a detail is unspecified. Record reasonable decisions instead of repeatedly asking for approval. Ask only for genuine blockers, credentials, or a material change in product scope. Never invent credentials, asset availability, question review, test results, load capacity, or deployment success. Use environment variables and documented setup instructions. Never request secrets in a public issue or commit them.

Production-quality implementation is the goal. A free-tier pilot is the initial deployment constraint. These are distinct: never claim production availability, failover, or 150-player capacity until the relevant checks pass. Report what is implemented, tested, blocked, and unsuitable for public release.

## 2. Product and audience

ElimQuest is an engaging Islamic knowledge quiz platform built around a shared animated staircase. Players answer the same question during each live round. Correct answers move them up; wrong or unanswered questions move them down. After the round everyone sees their feedback and the updated climb. A shared finale celebrates winners.

The audience includes teenagers, adults, families, friends, teachers, students, and community organisations. The presentation should be playful and adventurous without looking like a preschool app. Never treat quiz scores as a measure of faith, piety, or religious worth.

Launch with Islamic questions. Architect the engine for other subjects later. Categories, difficulty definitions, sources, question packs, and visual themes must be data/configuration, not Islamic-only branches scattered through the code. Do not expose unrelated secular categories at launch.

Initial category examples: Qur’an, Hadith, Seerah, stories of the prophets, Islamic history, everyday Islamic practices, and mixed challenges. Avoid overlapping duplicate questions across categories. Levels are 1–10, with 10 hardest. Do not display age groups or school classes as difficulty labels.

## 3. Scope and decision precedence

### Required first release

- Public landing page and topic exploration.
- Guest joining by code or link, nickname, and avatar.
- Account registration/sign-in for hosts and optional participant accounts.
- Two hosting modes: competing host and audience host.
- Ready-made reviewed question selection and private custom question packs.
- Immediate or future-dated rooms; manual host start only.
- Room links, codes, QR codes, native sharing/copying, and WhatsApp share links.
- Maximum 150 competing participants per live room; performance must be verified.
- Lobby, live quiz, animated staircase, personal round feedback, standings, shared finale, results, rematch, and mistake review.
- Guest-accessible solo practice using the same core scoring rules.
- Protected admin question authoring, CSV/XLSX import, review, publication, reports, and difficulty/category management.
- Reconnection, persistence, permissions, monitoring, tests, deployment instructions, and honest capacity limits.

### Explicitly not in the first release

- Automatic unattended game starts.
- Automated audience reminder emails, WhatsApp messaging integrations, or mass contact uploads.
- Timed host email reminders unless a proper external scheduler is separately introduced.
- A dedicated background worker service.
- AI opponents, teams, public matchmaking, global public rankings, paid power-ups, streak movement boosts, public chat, daily reward systems, or a cosmetics marketplace.
- AI-generated questions automatically entering the published question bank.
- Full real-time 3D environments or 150 detailed animated characters simultaneously on a phone.

Daily solo challenges, weekly community events, earned cosmetics, teams, automatic starts, and computer opponents are future ideas only. Keep personal result history, rematches, and mistake practice in v1 to support return visits.

Earlier discussion included 200 players, automatic starts, audience emails, Next.js, Cloudflare hosting, and realistic humans in a mockup. These are superseded: use **150 players, manual starts, host-managed audience outreach, React/Vite, Namecheap frontend hosting, Render backend hosting, and stylised animated human characters**.

## 4. Agreed stack and hosting

| Layer                         | Choice                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Web app and admin interface   | React + TypeScript + Vite                                                                  |
| Styling                       | Tailwind CSS with design tokens and accessible components                                  |
| Navigation                    | React Router                                                                               |
| Server-state fetching         | TanStack Query where useful; do not mirror live game state into conflicting caches         |
| Game scene                    | Phaser with custom sprite animations and perspective artwork                               |
| API and game runtime          | Node.js + Express + TypeScript                                                             |
| Live transport                | Socket.IO                                                                                  |
| Durable storage               | Supabase PostgreSQL, SQL migrations and transactional operations                           |
| Host/optional player identity | Supabase Auth                                                                              |
| Temporary room cache          | Redis, within measured free-tier limits                                                    |
| Email                         | Brevo                                                                                      |
| Frontend hosting              | Existing Namecheap hosting, subject to confirming a hosting plan rather than only a domain |
| Backend hosting               | Render Free for pilot; upgrade only with owner's approval                                  |
| Tests                         | Vitest, Playwright, integration tests, and a Socket.IO-aware load harness                  |

Use current stable mutually compatible package versions, pin them with a lockfile, and verify official documentation during implementation. Do not silently switch to Next.js, Firebase, a paid managed multiplayer service, or a different email provider.

Suggested repository layout: apps/web, apps/server, packages/contracts, packages/game-core, packages/config, database/migrations, tests/load, docs, and asset-source documentation. The admin UI may be a lazy-loaded /admin area of the same web app; it is a separate protected experience, not a reason to buy another server.

Use runtime schema validation such as Zod for HTTP inputs, socket payloads, imports, environment settings, and shared response contracts. Keep business logic independent of Express, React, Phaser, and Redis.

## 5. Game rules — implement explicitly

### Defaults chosen to resolve outstanding details

These are implementation defaults, not claims that every number was previously agreed: 20-question limit, 10-step summit, 30-second answer window, 3-second pre-round countdown, and approximately 8 seconds for the reveal/explanation/movement phase. Hosts can choose 10, 20, or 30 questions and 30, 45, or 60 seconds per question. Expose a summit-height selector with safe values up to the question count, defaulting to min(10, questionCount). Tower height and question count are separate settings.

This separation matters: if a 20-question match has a 20-step summit, only a perfect run can reach it. Explain settings clearly; never silently change the winner rules.

### Rules

1. Everyone starts at step 0. No negative positions.
2. Everyone receives the same question in a round with the same server-controlled deadline. Option ordering may be shuffled per player, using stable option identifiers.
3. Select an option, then Submit. Allow changing the selection before submission. The first accepted submission locks the answer.
4. A correct accepted answer gives +1 step. A wrong accepted answer or no accepted answer by the deadline gives −1 step, with a floor of zero.
5. No speed bonuses. No streak movement boosts in v1. Answer correctness is not disclosed until the round closes.
6. Keep the answer window open for its full duration; do not close early based on faster players.
7. After closing, score the entire round atomically, reveal the answer and explanation, then animate all position changes.
8. The first round in which anyone reaches the summit ends the match. All players reaching it in that round are joint winners. Submission arrival order and animation completion time never decide winners.
9. If the question limit is reached without a summit winner, whoever is highest wins, with shared positions and joint winners allowed.
10. Use one documented ranking method, e.g. competition ranking 1, 1, 3. Never break a tie by name, network speed, or client timestamps. Stable visual ordering within a tied group is not a rank advantage.
11. A solo player aims to reach the summit within the question limit; do not award a multiplayer win for being the only player in a practice session.

Wrong/unanswered feedback at step 0 says “You stay at the starting step” rather than falsely claiming descent. Make the penalty and deadline visible in rules before joining.

### Void questions

Audience hosts may flag and void an open or just-revealed question before the next question/finale is committed. Record an audit event, reverse all effects equally, and replace it with an unused eligible question. Voided questions do not count toward the valid round limit. If no replacement exists, explain the shortage and allow the audience host to finish using the valid scored rounds. Previously completed older rounds are not silently editable in v1. A competing host cannot selectively void or manipulate scoring. Final results are immutable except for an audited administrative correction process outside the live UI.

Allow a short reveal/review window before committing a summit finale so a known faulty final question can be voided. Pending winners may be indicated, but celebrate official winners only after finalisation.

## 6. Hosting modes and room lifecycle

### Competing host

An authenticated person creates and plays a system-generated game. They choose categories, difficulty, question limit, summit height, and timing, but never receive the question list or answer keys in advance. They can manage the lobby and start the game. Once started, progression is automatic and they cannot modify scores, selectively void questions, or inspect answers early. Restrict disruptive management powers during competition; all permitted interventions are audited and visible.

### Audience host

An authenticated organiser creates a quiz for an audience and does not occupy a competitive player slot. They may use reviewed system content or their own private question pack. They receive a control dashboard: player management, start, pause between rounds, resume, next-round controls, announcements between questions, question-void action under the defined window, end-session confirmation, and results. Question preview is allowed for this non-competing role, never for competing hosts.

Users who author a custom pack know its answers, so creating a game from their pack automatically uses audience-host mode. Host mode and question source become immutable at game start.

### Lifecycle

Draft → scheduled/open lobby → countdown → question open → reveal → climb/standings → next round or finished. Additional states: paused between rounds, recovery pause, cancelled, and expired.

Scheduled_at is an advertised gathering time with a stored timezone. The lobby page shows localised time and “Host starts the game.” Do not auto-start at that time. The host can start a ready lobby manually, with a warning if earlier than advertised. A date change updates share details and reminds the host to inform the audience.

Require at least two competitors for a multiplayer start. If only one arrives, offer a clearly separate solo practice flow rather than quietly changing the event. A lobby cap is enforced atomically server-side.

Late arrivals cannot join the competition after it starts. Offer read-only spectating if the configured total connection budget allows; otherwise offer the finished results or next game. Spectators and host connections consume capacity even when not part of the 150-player cap.

A host disconnect does not end an already-running game. Automatic round progression continues. A paused game remains paused until the authorised host returns or the room expires under a documented retention policy. Never silently promote a guest to host.

## 7. Guest identity, accounts, and permissions

Participants join with code/link, nickname, and avatar without an account. Hosting requires a verified account. Optional accounts save personal history. Use Supabase Auth for account creation, sign-in, email verification, password reset, sign-out, and account deletion workflow. Configure Brevo-backed email delivery as supported and tested by the chosen Supabase auth setup.

Guest identity uses a server-issued, scoped opaque credential, not a nickname or socket ID. Store/transport it safely, avoid URLs and logs, support refresh/reconnect, and plan cross-origin cookies/tokens for Namecheap-to-Render hosting. Document the chosen strategy, expiration, CSRF/XSS implications, and multi-tab behaviour. One participant identity has one active answer stream; resuming does not create duplicate players or permit second answers.

Allow users to link their own guest results to an account only after proving possession of that guest session. Anonymous history is best-effort on the same browser, not universal tracking.

Platform roles: member, content_reviewer, and super_admin. Host modes are per-game capabilities, not global admin roles. Public sign-up never grants reviewer/admin access. Enforce every permission in API/socket handlers and database policies, not only UI route guards.

## 8. Visual direction and design system

Use the supplied reference images as concept references, not as finished UI or a single flattened screenshot. Rebuild real text, buttons, input fields, responsive layout, and accessible semantics.

Approved direction: cinematic Islamic architectural adventure, continuous illuminated staircase, grand arches, geometric tiled details, lantern-lit terraces, subtle mist and nighttime depth. Mature and welcoming, suitable for teenagers and adults. Inspired by the immersive feeling of the supplied “World of Random” reference, but original composition, characters, brand, and layout. Do not copy its characters, logos, dice, awards, or protected artwork.

IMPORTANT latest change: all human characters must be stylised animated/game characters, not photorealistic people. Use consistent proportions and a cohesive animation style, modest clothing, diverse skin tones, and adult/teen-friendly appearances. No prophets, sacred historical figures, or claims that the summit represents heaven. Do not use sacred verses as decorative textures.

Proposed tokens: ink navy #071B2D, deep teal #075567, warm amber #F2B858, warm ivory #F7F1E5, calm success green, and muted error red. Validate actual contrast and adjust. Gold is the primary action colour, teal secondary. Use a refined display serif sparingly for major headings and a highly legible sans-serif for controls/question text. Arabic content, if included, must use a suitable Arabic font and proper direction without forcing the whole UI RTL.

Prefer subtle borders, clear spacing, readable surfaces, limited ornament, and consistent components. Avoid excessive glassmorphism, decorative icon clutter, aggressive gradients, constant particle loops, and childish mascots. UI text stays HTML; Phaser handles only the scene.

## 9. Complete page and screen specification

### 9.1 Home — /

Desktop: full-width cinematic hero, restrained navbar with ElimQuest at left, Explore Topics and How It Works, Sign In/account menu at right. Large left-aligned headline “Every answer, a step higher.” Supporting copy “Explore Islamic knowledge. Challenge your friends. Rise together.” Primary Host a Game button and secondary Practise Solo action. Right side/hero background is the original staircase world with stylised adventurers. Preserve quiet space behind text.

A prominent contrasting join panel contains visible Room Code label, input, and Join Game button. Do not bury joining in a menu. Below: topic cards, three-step how-it-works section, a simple live-versus-solo explanation, and footer with privacy, terms, help, accessibility/preferences. Do not invent testimonials, users, awards, or live activity numbers.

Mobile: compact navbar, readable headline, compact scenic crop, primary actions and join input within easy reach. No giant art region requiring several screens of scrolling before joining. Stack cards cleanly; maintain 44px minimum practical touch targets. No heavy Phaser runtime on the homepage; use responsive artwork and optional lightweight effects.

### 9.2 Topics — /topics and /topics/:slug

Show available published categories, short descriptions, available difficulty levels, and actions to practise or host. Filters should be understandable. Counts must be real. No answer-key preview from topics for future live games. Category details explain coverage; keep actual live selection server-side.

### 9.3 How it works — /how-it-works

Explain joining, answering, movement, no-answer penalty, shared round timing, shared winners, and host modes. Explain 150-player room limit without claiming unlimited simultaneous rooms. Use small illustrations and concise prose, not a wall of technical text.

### 9.4 Authentication — /sign-in, /sign-up, /forgot-password, /reset-password, /auth/callback

Simple form cards with a restrained illustrated side panel on desktop. Accessible validation, password visibility, loading states, resend cooldowns, generic responses where needed to prevent enumeration. Preserve intended destination after sign-in. Never block guest joining behind registration. Do not put Phaser assets on auth screens.

### 9.5 Host dashboard — /dashboard

Create Game action; upcoming/open rooms, active sessions, completed games; private question packs; account preferences. Cards show actual status, advertised date, joined count, host mode, and relevant action. Include empty states and cancellation confirmations. No fabricated analytics.

### 9.6 Create/edit game — /games/new and /games/:id/edit

Guided short wizard: (1) host mode, (2) question source, (3) categories and levels, (4) rounds/summit/time/cap, (5) now or future advertised date/time, (6) review and create. Save drafts. Display eligible inventory and clear shortages without exposing selected questions to competitors. Private custom packs force audience mode. Auto-select suitable defaults.

Optional group topic choice: host allows a shortlist; participants pick up to three preferences in the lobby; host closes voting before start. Build a balanced deterministic category quota from votes, redistributing unavailable categories transparently. Everyone still receives the same questions. This is not separate difficulty per player. If it complicates the first vertical slice, implement after the standard host-selected flow but include before marking the full requested scope complete.

### 9.7 Room details and sharing — /games/:id/share

Show title, date/time/timezone, host mode, topics, difficulty, rules summary, code, join URL, QR, Copy Invite, Copy Link, WhatsApp share link, and calendar download. Share preview must not leak private questions, emails, or player tokens. Hosts handle audience outreach. A host confirmation email can be sent immediately, containing sharing details and a reminder to contact their audience. No recipient-email collection screen or automatic audience reminder promise.

### 9.8 Join — /join and /join/:code

Resolve room, show host display name/title, topics, level range, time, valid-round limit, summit height, and rules. Ask nickname and avatar; allow optional account use. States: invalid/expired code, scheduled room, full room, cancelled room, already started, reconnect existing player, and finished room. Handle duplicate nicknames with a visible short distinguishing suffix without exposing identity. Prevent impersonation of host/system labels and apply basic moderation.

### 9.9 Lobby — /rooms/:code/lobby

Architectural courtyard or base-of-stairs scene, player avatar tiles, joined count, room code, rule summary, chosen settings, readiness/loading status, and “Waiting for host.” Future rooms also show time remaining to the advertised gathering time, clearly not an automatic start countdown. Host gets Start Game and permitted management controls. Preload essential compressed game assets here; provide a fallback so one slow device does not block everybody forever. Do not preload the live answer bank.

### 9.10 Player game — /rooms/:code/play

Mobile layout follows the approved original staircase reference: immersive perspective staircase above, quiz panel below. Actual full-body stylised avatars stand on numbered treads, viewed predominantly from behind. Shared-step players stand side-by-side where possible. Highlight “You.” Show own step, leading step, participant count, round number, timer, sound toggle, and View Players. Group overflow with counts and an accessible expandable roster. Avoid 150 overlapping characters or labels.

Desktop uses a roomy staircase/quiz composition; keep question readability primary. On mobile reduce scene height while answering so question and four choices remain practical. During reveal, temporarily emphasise the staircase. Reflow long questions rather than shrinking text. No timers hidden below the fold.

Answer options are HTML buttons/radio controls with stable labels, selected state, Submit, Sending, and Answer Received states. Display a batched aggregate “86 of 128 answered” only from actual server counts. Never show correctness, explanations, or other players' selections early. Show a subtle reconnect banner without blocking readable content.

### 9.11 Round reveal and climb — state within game route

Correct: “Correct! Up one step.” Wrong: “Not quite” plus the correct answer. Unanswered: “Time’s up.” At zero show no-movement wording. Give a concise explanation and expandable source/reference. Combine text, symbols, and colour; colour alone is insufficient. Play a short reusable climb/descend animation after results arrive, then show shared positions and next-round countdown. Optional sound must be user-controlled and never required. No humiliating failure animation.

### 9.12 Audience host controls — /rooms/:code/host

Desktop dashboard with current phase/question, time remaining, submitted count, player roster, connection status, standings, and permitted controls. Mobile controls remain usable. Hosts can pause between rounds, resume, advance from a paused reveal, announce between rounds, remove disruptive guests, void a question under the allowed rules, and end with confirmation. End early marks results “Ended early”; never silently describes it as a completed scheduled match. Audit all management actions. No private answer distribution during the open question.

### 9.13 Finale and results — /games/:id/results

Everyone sees the winner or joint winners in a polished shared summit celebration. Use stylised avatars, tasteful light/short celebratory particles, names, and final steps. Support many joint winners without overcrowding. Skip or reduce animation when requested. No speed-based ordering masquerading as merit.

Then show rankings, own progress, correct/wrong/unanswered totals, valid rounds, topic breakdown with honest small-sample wording, and explanation review. Actions: Rematch with Fresh Questions, Practise My Mistakes, Return Home; optional Save My Results sign-up for guests. Rematch is a new room/session with fresh eligibility checks; spectators can join that lobby. Audience host gets aggregate summary and safe CSV export. Restrict result access appropriately; no public exposure of emails or private custom content.

### 9.14 Solo — /practice, /practice/:id/play, /practice/:id/results

Choose categories, level range, round limit and summit height, then play the same staircase and feedback loop. Guest access works. Use the same domain scoring functions and separate session identity. No simulated human opponents or fake rankings. Mistake practice deliberately repeats missed questions and clearly labels that exception to fresh-question selection. Account holders can save history.

### 9.15 Custom packs — /packs, /packs/new, /packs/:id/edit

Private pack list and editor with question text, four options, one correct option, explanation, topic, level, optional references. Reorder/edit/duplicate/archive drafts, preview, import CSV/XLSX via provided template, and validate. State clearly that custom content is host-provided, not platform-reviewed. Published public packs require a separate review submission. Do not mutate a pack snapshot used by a running game.

### 9.16 Profile and preferences — /account

Nickname/avatar, result history, sound and reduced-motion preferences, email preferences, account deletion, and sign-out. Guests see only appropriate local preferences and optional sign-up. No unnecessary birthdate collection.

### 9.17 Admin — /admin and nested routes

Clean operational UI, not an animated game scene. Dashboard of real draft/review/publication counts; questions list with filters; individual editor; import wizard; review queue; category/subcategory editor; Levels 1–10 rubric; content reports; admin audit log. Super-admin-only role management and platform capacity/settings. Use human-readable selectors, never require users to paste database IDs.

Question import sequence: download template → upload → parse/validate → row errors and duplicate candidates → preview → explicit save as drafts → review → publish. Support staged import batches for larger files without tying up the Node event loop. Do not silently publish or partially accept invalid rows without a clear summary. Disallow macro execution, cap file size/row count, protect CSV exports against formula injection.

Reviewer screens show prompt/options/correct answer/explanation/references/level/category/history and approve, request changes, reject, archive actions. Separate authoring from review when possible; any exceptional super-admin override is explicit and audited. A public question is playable only when its exact version is approved and published.

### 9.18 Help, policies, and system states

Implement /help, /privacy, /terms, 404, offline/reconnect, maintenance/recovery, error boundaries, and room-expired pages. Policy drafts must reflect actual data practices and be marked for owner review; do not claim certification or legal compliance without evidence. Every async screen needs loading, empty, validation, permission, and retry states.

## 10. Question content and repetition

The content subsystem is separate from the game engine. Proposed entities: categories/subcategories, difficulty_definitions, question_versions, question_options, references, review_decisions, import_batches, packs, pack_items, usage_history, and content_reports.

Required question fields: stable ID and version, question text, four non-empty distinct options, exactly one correct option ID, explanation, category, level 1–10, language, provenance/author, source/reference where relevant, rights/licence metadata, and review/publication status. Keep disputed-answer context explicit. Do not assert that an assistant-generated answer has been scholar-reviewed.

Provide draft seed fixtures for development and automated tests, clearly excluded from public production games until reviewed. A production installation with insufficient reviewed content should show a clear setup/inventory message, not quietly use unverified seed questions.

Never repeat within a game. Select against stable canonical IDs so reworded versions do not count as fresh. Prefer questions unseen by signed-in participants and unused in recent sessions by the host. Guest history uses the available guest identity, with clear limits. The intersection of unseen questions for 150 users may be empty; do not promise lifetime non-repetition.

Before a game starts, show a shortage and offer fewer questions, broader category/level selection, or explicit permission to reuse historical questions. Never silently repeat within the match or generate questions on demand. Custom packs and mistake practice have clearly documented exceptions to historical freshness, not to same-match duplication.

Define a reviewer rubric for Levels 1–10 based on knowledge depth, number of reasoning steps, and prerequisite knowledge, not merely obscurity. Use answer statistics to flag potential misclassification, but do not automatically change levels or game snapshots mid-match.

## 11. Realtime architecture, fairness, and persistence

The server is authoritative for phase, current question, clock deadlines, accepted answers, steps, rank, and winners. The browser only renders and requests actions. Never trust client-provided correctness, position, host status, elapsed time, or result totals.

A typed state machine owns transitions. Every event carries room/session identity, phase/round identity, sequence or state version, and server timestamp as appropriate. Clients ignore stale events and request a fresh authorised snapshot when sequence gaps appear. Reconnection must not rely solely on Socket.IO recovery.

Example contracts: join/resume, lobby snapshot, start request, round opened, answer submit/ack, aggregate submission count, round result, pause/resume, announcement, state snapshot, game finished. Distinguish command acknowledgement from broadcast events. Return safe participant-specific views; never send raw database rows containing answer keys.

Use a database uniqueness constraint for (session_id, round_id, participant_id). An idempotent retry of the accepted answer gets the original acknowledgement; a later different answer is rejected. Persist accepted answers before acknowledging them. Define deadline acceptance at a trusted server boundary and document any bounded infrastructure processing allowance; never accept arbitrary client backdated answers. No late submissions after reveal. Test submissions near the deadline under burst load.

Synchronise display clocks using server time and start/end timestamps. Do not send a network tick every second. Do not ship future questions/answer keys to browsers as a latency shortcut. Fetch current question promptly at round opening and preload only non-secret assets. Network conditions cannot be made identical; no speed rewards and generous windows mitigate rather than eliminate the issue.

Persist room configuration, phase/deadlines, immutable selected question versions, answers, scored round outcomes, and final results. Score transitions transactionally and idempotently. Redis is a cache/coordination aid, not the only record of completed work. A cache outage must not erase official results or cause duplicate movement.

One active controller per room. Initial deployment uses one game-server instance with single-process ownership plus durable transition checks. On restart, recover into a visible recovery pause; do not blindly mark all missing submissions wrong because a server outage consumed the timer. Resume with a fair full window if answers were not exposed, or void and replace the compromised round. Test and document this policy. Personal network failures still follow the unanswered rule.

For a later multi-server deployment use room ownership leases/fencing, transactional state checks, an appropriate Socket.IO adapter such as Redis Streams, and sticky routing if long polling is enabled. Do not introduce horizontal scaling until tested. Broadcasting via Redis alone is not a distributed game-controller solution.

## 12. Security and privacy

- Validate Supabase sessions on the server; do not trust decoded but unverified tokens.
- Use HTTPS/WSS, precise origin allowlists, and a documented cross-origin auth policy. CORS is not authorisation.
- Keep Supabase privileged keys, PostgreSQL credentials, Redis credentials, and Brevo keys server-side. No VITE\_ variable may contain a secret.
- Keep answer-key tables inaccessible to public browser roles. Use RLS and safe views/DTOs. Review what a competing host can query directly.
- Rate-limit code guessing, joins, submissions, room creation, auth operations, and email triggers; cap socket payloads and imports.
- Enforce room membership and per-game host capabilities on every command. Use unpredictable room codes with expiry; room codes are not host credentials.
- Sanitize user content and announcements; avoid arbitrary executable HTML. Use content security policy appropriate to the app.
- Limit anonymous room flooding; show clear limits and cooldowns rather than silently upgrading infrastructure.
- No public chat or direct messages in v1. Preset reactions, if included, are rate-limited and restricted to between rounds.
- Keep logs free of secrets, emails where unnecessary, and unrevealed answer payloads. Establish data retention and deletion rules for guest sessions, expired lobbies, and account records.
- Audit publication changes, role grants, question voids, host interventions, and final result corrections.

## 13. Performance and accessibility requirements

150 players per room is a target, not a proven limit. Platform concurrency is configurable separately: 10 full rooms mean 1,500 players plus hosts/spectators. Begin with one active full-room pilot if needed. Refuse excess rooms/connections gracefully; never advertise unsupported unlimited capacity.

Phaser scene design: compressed perspective background/tiles, texture atlases, reusable character walk/climb/descend/idle/celebrate animations, minimal particles, no real-time 3D shadows or per-player physics. Render a measured small number of avatars, prioritising self, leaders, and nearby positions. Group the rest by step. Keep the full roster in accessible HTML.

Lazy-load Phaser only for lobby preload/gameplay; unload scenes, listeners, textures where appropriate, and socket subscriptions on navigation. Avoid restarting the scene on every React render. Throttle non-critical counters and batch round updates. Do not broadcast a complete roster after every answer. Do not put every animation frame or timer tick through React state.

Use responsive compressed art, explicit dimensions, reduced device-pixel ratio on low-tier devices, a 30fps low-power target, hidden-tab suspension, and reduced-motion fallbacks. No autoplay audio; respect user preference. Keep a functional HTML game view if WebGL/scene loading fails. A local rendering failure must not prevent answering.

Accessibility: keyboard operation, visible focus, labelled inputs, sensible reading order, screen-reader announcements for meaningful phase/score changes rather than every timer tick, contrast, zoom/reflow, text alternatives to the staircase, and non-colour-only feedback. Minimum practical touch targets around 44px. Support Arabic text where supplied without pretending the whole product has been translated.

Proposed measured budgets, adjustable with evidence: initial mobile page transfer around 1 MB or less excluding deferred game art; initial compressed game assets around 3 MB or less; smooth 30fps on the selected lower-end test phone; 60fps where practical. Report measurements, not assumptions. Do not use massive generated images uncompressed in the shipped UI.

## 14. Free-tier deployment and operational constraints

Frontend: build static React assets and upload dist to Namecheap's configured document root. Confirm the account includes hosting. Supply .htaccess SPA fallback, HTTPS setup notes, cache headers, versioned asset handling, and a fallback that does not rewrite missing asset requests to HTML. Use appropriate domain/subdomain configuration. Do not assume root-path hosting if deploying in a subdirectory.

Backend: Render service for Express/Socket.IO, correct PORT binding, allowed web origins, health/readiness endpoints, graceful shutdown, database pooling and connection limits, migrations, and rollback instructions. Keep server/database/Redis regions reasonably close where available and measure latency from intended users.

Render Free may sleep and has resource/availability limits. Display a helpful waking-server state and have the host open the room before gathering players. Do not create artificial traffic to evade free-plan policies. Active games must survive reconnect/restart according to documented recovery, but no uptime guarantee is implied. Verify current provider limits before deployment.

Redis: include an adapter/cache module and managed free-tier configuration. Measure commands, bandwidth, memory, connection counts, and burst behaviour. Reuse a small backend connection pool; browsers never connect to Redis. Free plan limits may be too low for per-answer writes at scale. Avoid unnecessary Redis writes; PostgreSQL remains authoritative. If Redis is unavailable, operate only in the tested single-instance fallback mode or enter recovery safely. Never fall back unsafely across multiple servers.

Brevo: immediate account/host-confirmation emails only in v1. Sending one email per game-creation event must be idempotent and rate-limited. Reserve quota for account recovery. A non-critical email failure must not destroy a created game; show a resend path. Future timed host reminders require proper scheduling and are deferred. Host confirmations include room link, advertised time/timezone, share copy, and instructions to remind their own audience. Do not claim WhatsApp share links send automated messages.

No dedicated worker. Use bounded import batches and request-triggered immediate email calls initially. Database deadlines and recoverable state underpin game progression; do not use a browser tab as the match clock. Provide backup/export and restore procedures appropriate to the actual free plan; do not claim paid-plan automated backups exist for free.

Document environment variable names without secret values: web API/socket base URLs, Supabase public URL/key, deployment base path; server database credentials, Supabase auth validation settings, Redis URL/TLS, Brevo API key and verified sender, public web URL, allowed origins, cookie/token settings, room/connection limits, and log level. Define and validate exact names in .env.example.

## 15. Asset checklist and generation briefs

Do not delay core architecture while waiting for assets. Use lightweight clearly-labelled placeholders, an asset manifest, and stable asset interfaces. Tell the owner exactly which assets are missing and where to place them. Do not call an asset-final build complete while using placeholders.

Required visual references to attach: (1) approved ElimQuest cinematic landing mockup, (2) approved staircase gameplay mockup, and optionally (3) original staircase screenshot for structural comparison. The landing mockup's realistic humans must be replaced with stylised animated characters. Reference screenshots are not reusable layered production artwork.

### Asset A — landing hero, desktop and mobile

Generation brief: “Original cinematic Islamic-inspired architectural adventure world for ElimQuest. Grand tiled arches, lantern-lit continuous staircase, sandstone terraces, navy night sky, teal atmospheric depth, warm amber illumination. Mature stylised game art, not photorealistic humans and not preschool cartoon. A few modestly dressed stylised adventurers seen from behind. Desktop composition leaves quiet dark space on the left for HTML headline and controls; architecture and ascending path dominate the right. No text, UI, logos, sacred figures, sacred verses, awards, or copied game characters. Create a separate mobile crop/composition retaining clear space for UI.”

Target source sizes roughly 2400×1400 desktop and 1080×1440 mobile; export responsive compressed AVIF/WebP variants. Prefer a background-only variant as well so characters can be independently animated later. Do not force real-time movement into a flattened image.

### Asset B — gameplay staircase

Generation brief: “Perspective staircase viewed from behind a player at its base, ascending toward a distant decorative arch. Wide clearly distinguishable treads support several characters side-by-side. Original navy/teal Islamic geometric architecture and warm lantern edges. No characters, no stair numbers, no UI, no text, no sacred figures. Consistent game-art lighting and camera.”

Create usable landing/tread geometry or repeatable scene pieces. Number steps in code. Provide explicit step coordinates, scale/depth anchors, foreground occlusion masks where needed, and camera framing in configuration. A pretty background alone is not a functional scalable staircase. Ensure 10–30-round configurations do not require inaccurate baked-in numbers.

### Asset C — animated character set

Create a small coherent set of original stylised teenage/adult avatars with diverse skin tones, modest clothing, and consistent lighting. Include suitable male/female presentation options such as tunics, ordinary modest outfits, and hijab options without assuming every user chooses the same clothing. No real-person likenesses or sacred historical figures.

For gameplay supply transparent PNG/WebP sprite atlases plus frame metadata. States: idle, climb/walk, descend, short celebration; orientations suitable for the staircase/back view plus face/portrait icons for lobby/results. Use consistent canvas size, ground anchor, framing, and character proportions. Separate names and outlines are rendered by code. Define frame counts after an animation proof-of-concept.

Important: a generated contact sheet is not automatically an animation-ready sprite sheet. Verify frame registration, transparent edges, feet placement, loop continuity, dimensions, and walking cycle. If the generation tool cannot produce coherent frames, use a rigged 2D workflow or licensed assets and record rights. Do not promise image generation alone creates production-ready animation.

### Asset D — supporting UI art

Four to seven category illustrations, small reusable geometric separators, and a temporary original vector wordmark/emblem. No text baked into category images. Favicon/app icons derive from the brand mark. Keep illustrations respectful and visually consistent. Store colours/marks in replaceable theme settings.

### Asset E — sound and motion

Optional short neutral UI sounds for submission, reveal, climbing, descending, and finish, with mute controls. No required music or devotional recordings. Provide licence/provenance. Build simple button transitions, focus states, and progress feedback in CSS. Use Phaser for game characters. Lottie is optional only for isolated decorative effects; do not add it without a concrete benefit.

Maintain assets/manifest with file, purpose, dimensions, byte size, author/source, licence, variant, and loading priority. Keep editable source outside the public shipped bundle. Inspect all assets on mobile before release.

## 16. Tests and release gates

### Domain and integration tests

- Correct +1, wrong/unanswered −1, floor zero, valid round limit, summit wins, and joint winners.
- Multiple participants reaching the summit in one round regardless of submission order.
- Void reversals/replacements, no early finale, immutable final results.
- Duplicate submissions, retries, lost acknowledgements, conflicting second answers, stale rounds, and exact deadline boundaries.
- Atomic room capacity, one identity across tabs/reconnect, full-room rejection, late spectator policy.
- Host-mode permissions and blocked preview/answer-key endpoints for competing hosts and guests.
- Publication-only selection, immutable question snapshots, no same-match repeat, exhaustion flows, historical reuse consent, and private pack isolation.
- Database/RLS checks, role escalation attempts, room-code guessing limits, malicious imports, and secret leakage checks.
- Server crash during answer acceptance, scoring, reveal, and finalisation; Redis interruption; recovery pause and resume without double scoring.

### Browser and accessibility tests

Guest join, host creation, competing and audience sessions, account verification/reset paths, custom pack import, admin review/publish, solo/mistake practice, result ownership, and route refresh on Namecheap-style hosting. Test keyboard-only and screen-reader-friendly question controls, long text, mobile portrait/landscape, reduced motion, sound off, WebGL failure, asset failure, and slow connections.

### Capacity tests

Use actual Socket.IO clients, not a plain-WebSocket harness that ignores the protocol. Run progressive tests at 20, 50, 100, and 150 players, then multiple rooms only if resources allow. Include simultaneous joins, deadline submission bursts, host/spectator connections, 20–30 rounds, and reconnect storms. Use a controlled staging environment within provider policies.

Record CPU, memory, event-loop delay, database pool use, query latency, Redis throughput/memory/bandwidth, socket disconnects, inbound/outbound bandwidth, answer acknowledgement p50/p95/p99, and round-finalisation latency. Separate injected client-network delay from backend processing time. Suggested target: p95 acknowledgement below 500 ms in controlled same-region tests, no lost accepted answers, no double scoring, and results within two seconds of deadline under target load. Treat these as acceptance targets, not promises already achieved.

Measure gameplay on at least one lower-end real Android phone or document the device-testing blocker. Browser CPU throttling supplements rather than replaces real-device testing. Publish the actual safe room/concurrency cap from results; keep 150 disabled publicly if tests do not support it.

## 17. Implementation milestones

1. Audit repository and runtime; create requirements checklist, decisions, workspace, typed contracts, environment validation, theme/config boundaries, and CI baseline.
2. Implement schema/migrations/auth permissions, draft seed fixtures, question CRUD/import/review/publication, and one valid reviewed-content flow in a test environment.
3. Build and test pure scoring/state-machine logic and one functional server-authoritative room without elaborate visuals.
4. Complete guest identity, reconnection, crash recovery, host modes, inventory selection, all answer acknowledgements, results, and abuse controls.
5. Implement the landing page and responsive application screens with the approved visual hierarchy; integrate Phaser through a clear scene adapter. Add round/finale motion and fallback modes.
6. Complete custom packs, optional lobby topic voting, solo/mistake practice, account history, sharing/calendar, immediate Brevo email flows, and admin operational screens.
7. Run security, accessibility, lifecycle, performance, and load checks. Fix failures. Prepare Namecheap/Render configuration, database migrations, backup/restore and incident documentation. Do not deploy externally or upgrade services without the owner's deployment authorisation.

Keep the core game demonstrable at each milestone. Do not build an elaborate landing page and leave multiplayer as mocked events. Development mocks must be explicitly gated and absent from production paths.

## 18. Required handover

Deliver working source, lockfile, .env.example files, database migrations and rollback guidance, safe test fixtures, automated tests, asset manifest, import templates, README, local setup commands, Namecheap upload/rewrite instructions, Render settings, Supabase Auth/Brevo setup, operational limits, and a short architecture/decision document.

Include a requirement-by-requirement completion report, real validation output, remaining missing assets/credentials/reviewed questions, accessibility and capacity results, and a known-limitations list. Explain recovery, how to change the brand/theme, how to add a non-Islamic category later without exposing it now, and how to raise room limits safely.

Before declaring completion verify: a guest can join; an authenticated host can create/start a real game; two or more devices receive the same round; submissions persist; scoring is correct; animated positions match authoritative results; reconnect works; an audience host can control their event without competing; no participant can retrieve unrevealed answers; admin publication controls actual playable inventory; and the application deploys using the specified frontend/backend separation.

Begin by inspecting the repository and preparing a concise implementation plan, then proceed with the first working vertical slice. Keep the owner informed of actual progress and material blockers, without repeatedly asking about settled decisions.
