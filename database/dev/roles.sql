-- DEVELOPMENT / TEST ONLY. Supabase already provides these roles; PGlite does not.
-- Lets tests prove that browser roles cannot read answer-key tables.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
