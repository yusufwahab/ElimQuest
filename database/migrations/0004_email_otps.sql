-- One-time sign-up codes. Only a keyed hash of the code is stored; rows are single-use, expire, and lock after too many wrong tries.
create table email_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,                       -- lower-cased
  code_hash text not null,
  display_name text not null default '',
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index email_otps_email_idx on email_otps(email, created_at desc);
alter table email_otps enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on email_otps from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on email_otps from authenticated; end if;
end $$;
