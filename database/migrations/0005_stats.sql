-- First-party, privacy-preserving usage statistics (super-admin only). No IP address, user agent or cookie is ever stored.
-- Daily counters: one row per (day, metric, key). Metrics: visitors, pageviews, page (key = route pattern), device, browser, ref (key = referring host), signin, signin_failed.
create table site_daily (
  day date not null,
  metric text not null,
  key text not null default '',
  n bigint not null default 0,
  primary key (day, metric, key)
);
-- Unique-visitor de-duplication: a keyed hash that changes every day, kept for two days then deleted. Cannot be reversed to a person.
create table site_visitors (
  day date not null,
  vid text not null,
  primary key (day, vid)
);
-- Which signed-in accounts were active on which day (powers daily/weekly/monthly active users). Shown only as counts.
create table user_days (
  day date not null,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (day, user_id)
);
-- Login sessions already counted as a sign-in (session id from the verified token). Deleted after 90 days.
create table session_seen (
  session_id text primary key,
  user_id uuid references profiles(id) on delete cascade,
  first_seen timestamptz not null default now()
);
create index session_seen_first_idx on session_seen(first_seen);

do $$
declare t text;
begin
  foreach t in array array['site_daily','site_visitors','user_days','session_seen'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on %I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on %I from authenticated', t); end if;
  end loop;
end $$;
