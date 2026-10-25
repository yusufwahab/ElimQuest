# Database

- `migrations/NNNN_name.sql` are applied in order by `npm run migrate -w @elimquest/server` and recorded in `schema_migrations`. Each migration runs in a transaction.
- Every migration ships a `.down.sql` rollback (0001's drops **everything**; take a dump first). 0002 only changes grants and has no destructive down step.
- `dev/roles.sql` and `dev/dev_auth.sql` are applied only for the PGlite dev/test driver. Supabase provides `anon`/`authenticated`; dev auth tables must never exist in production.
- Security model: RLS is enabled on every table; browser roles have **no** table privileges except `select` on `categories` (published rows only) and the caller's own `profiles` row. All reads/writes go through the API with a privileged connection. Tests (`content.test.ts`) prove `anon`/`authenticated` cannot read `question_options`, `game_questions`, `participants`, `profiles`, `question_versions`.
- A trigger (`enforce_question_ready`) refuses to approve/publish a question version without exactly 4 distinct options, exactly 1 correct, and an explanation.
- `games.code` is unique only among non-terminal games, so codes recycle after a game ends.
