-- Browser-facing roles get nothing by default; the API server's privileged role does all reads/writes.
-- (Supabase grants broad default privileges to anon/authenticated; revoke them explicitly.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    grant select on categories to anon;           -- only published rows pass RLS
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    grant select on categories to authenticated;
    grant select on profiles to authenticated;    -- only own row passes RLS
  end if;
end $$;
