-- ElimQuest initial schema. Authoritative store for content, games, answers and results.
-- The API server connects with a privileged role; browsers never query these tables directly.

create table profiles (
  id uuid primary key,                       -- = Supabase auth.users.id
  email text not null,
  display_name text not null,
  role text not null default 'member' check (role in ('member','content_reviewer','super_admin')),
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deletion_requested_at timestamptz
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id),
  slug text not null unique,
  name text not null,
  description text not null default '',
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table difficulty_definitions (
  level int primary key check (level between 1 and 10),
  title text not null,
  rubric text not null
);

create table packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical question identity; rewording creates a new version, never a new canonical id.
create table questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  scope text not null default 'platform' check (scope in ('platform','pack')),
  pack_id uuid references packs(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check ((scope = 'pack') = (pack_id is not null))
);

create table question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  version int not null default 1,
  text text not null,
  explanation text not null,
  level int not null check (level between 1 and 10),
  language text not null default 'en',
  reference text not null default '',
  provenance text not null default '',
  licence text not null default '',
  disputed boolean not null default false,
  dispute_note text not null default '',
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','published','rejected','archived')),
  is_fixture boolean not null default false,  -- development seed: never playable in production
  author_id uuid references profiles(id),
  position int not null default 0,            -- ordering inside a pack
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (question_id, version)
);
create index question_versions_status_idx on question_versions(status);

create table question_options (
  version_id uuid not null references question_versions(id) on delete cascade,
  option_id char(1) not null check (option_id in ('a','b','c','d')),
  text text not null check (length(trim(text)) > 0),
  is_correct boolean not null default false,
  primary key (version_id, option_id)
);
create unique index question_options_one_correct on question_options(version_id) where is_correct;

-- Publication gate: exactly 4 distinct options, exactly 1 correct, before a version may be approved/published.
create function enforce_question_ready() returns trigger language plpgsql as $$
declare n int; c int; d int;
begin
  if new.status in ('approved','published') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select count(*), count(*) filter (where is_correct), count(distinct lower(trim(text)))
      into n, c, d from question_options where version_id = new.id;
    if n <> 4 or c <> 1 or d <> 4 then
      raise exception 'question % is not ready: needs 4 distinct options and exactly one correct', new.id;
    end if;
    if length(trim(new.explanation)) = 0 then raise exception 'question % needs an explanation', new.id; end if;
  end if;
  return new;
end $$;
create trigger question_ready before insert or update of status on question_versions
  for each row execute function enforce_question_ready();

create table review_decisions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references question_versions(id) on delete cascade,
  reviewer_id uuid references profiles(id),
  action text not null,
  note text not null default '',
  override boolean not null default false,
  created_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('admin','pack')),
  created_by uuid not null references profiles(id),
  pack_id uuid references packs(id) on delete cascade,
  file_name text not null,
  status text not null default 'parsed' check (status in ('parsed','saved','discarded')),
  summary jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table content_reports (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references question_versions(id) on delete cascade,
  game_id uuid,
  reason text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table audit_events (
  id bigserial primary key,
  actor_id uuid,
  actor_label text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  game_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on audit_events(created_at desc);

create table platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

-- Games -------------------------------------------------------------------------------------------
create table games (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null,
  host_user_id uuid not null references profiles(id),
  title text not null,
  host_mode text not null check (host_mode in ('competing','audience')),
  source text not null default 'system' check (source in ('system','pack')),
  pack_id uuid references packs(id),
  category_ids uuid[] not null default '{}',
  min_level int not null default 1,
  max_level int not null default 10,
  settings jsonb not null,
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  allow_history_reuse boolean not null default false,
  voting jsonb,                                -- {open:boolean, shortlist:uuid[]}
  phase text not null default 'draft',
  phase_deadline timestamptz,                  -- countdown end / next-round time
  paused boolean not null default false,
  recovery boolean not null default false,
  version int not null default 0,
  round_seq int not null default 0,
  announcement text,
  end_reason text,
  ended_early boolean not null default false,
  pending jsonb,                               -- finale-review hold {winners, reason, until}
  rematch_of uuid references games(id),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);
-- Room codes are unique among non-terminal games only, so they can be recycled after expiry.
create unique index games_active_code on games(code) where phase not in ('finished','cancelled','expired');
create index games_host_idx on games(host_user_id, created_at desc);

create table game_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  seq int not null,
  question_version_id uuid not null references question_versions(id),
  canonical_id uuid not null,
  snapshot jsonb not null,                     -- immutable copy, includes answer key: server-only
  role text not null default 'main' check (role in ('main','reserve')),
  status text not null default 'queued' check (status in ('queued','used','voided')),
  unique (game_id, seq),
  unique (game_id, canonical_id)               -- never repeat within a match
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid references profiles(id),
  nickname text not null,
  avatar jsonb not null,
  token_hash text not null unique,
  device_key text,                             -- hashed browser id for best-effort guest history
  position int not null default 0 check (position >= 0),
  is_spectator boolean not null default false,
  is_host_player boolean not null default false,
  removed boolean not null default false,
  joined_at timestamptz not null default now()
);
create unique index participants_nick on participants(game_id, lower(nickname));
create index participants_game_idx on participants(game_id);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_seq int not null,
  round_no int,                                -- assigned when scored (valid-round number)
  game_question_id uuid not null references game_questions(id),
  status text not null default 'open' check (status in ('open','closed','scored','voided')),
  shuffle_salt text not null,
  opened_at timestamptz not null,
  deadline timestamptz not null,
  closed_at timestamptz,
  scored_at timestamptz,
  void_reason text,
  unique (game_id, round_seq)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  option_id char(1) not null check (option_id in ('a','b','c','d')),
  accepted_at timestamptz not null default now(),
  unique (round_id, participant_id)
);

create table round_outcomes (
  round_id uuid not null references rounds(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  outcome text not null check (outcome in ('correct','wrong','unanswered')),
  step_before int not null,
  step_after int not null,
  primary key (round_id, participant_id)
);

create table game_results (
  game_id uuid not null references games(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  final_step int not null,
  rank int not null,
  is_winner boolean not null,
  correct int not null,
  wrong int not null,
  unanswered int not null,
  primary key (game_id, participant_id)
);

create table topic_votes (
  game_id uuid not null references games(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  category_ids uuid[] not null,
  primary key (game_id, participant_id)
);

-- Question history for freshness. owner_key: 'u:<userId>' (signed-in), 'g:<participantId>' (guest), 'h:<hostUserId>'.
create table usage_history (
  owner_key text not null,
  canonical_id uuid not null,
  game_id uuid,
  used_at timestamptz not null default now(),
  primary key (owner_key, canonical_id)
);

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references profiles(id),
  mode text not null default 'fresh',
  settings jsonb not null,
  queue jsonb not null,                        -- [{canonical_id, version_id, snapshot}] server-only
  position int not null default 0 check (position >= 0),
  round_no int not null default 0,
  current jsonb,                               -- {idx, openedAt, deadline, salt}
  history jsonb not null default '[]'::jsonb,  -- per-round records for review
  status text not null default 'active' check (status in ('active','finished')),
  succeeded boolean,
  created_at timestamptz not null default now()
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  game_id uuid,
  user_id uuid,
  status text not null check (status in ('sent','logged_dev','failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (kind, game_id)
);

-- Row level security: enabled everywhere, no policies for browser roles except public read of published categories.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy categories_public_read on categories for select using (published);
create policy profiles_self_read on profiles for select using (id::text = current_setting('request.jwt.claim.sub', true));
