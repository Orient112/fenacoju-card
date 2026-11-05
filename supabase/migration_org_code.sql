-- Identifiants hiérarchiques Ligue → Entente → Club
alter table users add column if not exists org_code text;

create index if not exists idx_users_org_code on users(org_code);
