-- Migration : hiérarchie Coordon → Ligue → Entente → Club + validation
-- Exécutez dans Supabase → SQL Editor

alter table users drop constraint if exists users_type_check;

alter table users
  add constraint users_type_check
  check (type in ('admin', 'federation', 'ligue', 'entente', 'club', 'entraineur'));

alter table users add column if not exists statut text default 'actif';
alter table users add column if not exists parent_id uuid references users(id) on delete set null;
alter table users add column if not exists nom_organisation text;

update users set statut = 'actif' where statut is null;

alter table users drop constraint if exists users_statut_check;
alter table users
  add constraint users_statut_check
  check (statut in ('pending', 'actif', 'rejete'));

create index if not exists idx_users_parent_id on users(parent_id);
create index if not exists idx_users_statut on users(statut);
create index if not exists idx_users_type on users(type);
