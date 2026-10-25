-- DEVELOPMENT / TEST ONLY (AUTH_MODE=dev). Never applied against a production database.
create table if not exists dev_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  password_hash text not null
);
alter table dev_credentials enable row level security;
