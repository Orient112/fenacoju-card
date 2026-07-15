-- Migration : arbitres + membres sans login + acces_systeme
-- Coller dans Supabase → SQL Editor

alter table users drop constraint if exists users_type_check;
alter table users
  add constraint users_type_check
  check (type in ('admin', 'federation', 'ligue', 'entente', 'club', 'entraineur', 'membre'));

alter table users add column if not exists acces_systeme boolean default true;

-- Entraineurs et membres fédération : pas de connexion
update users set acces_systeme = false where type in ('entraineur', 'membre');
update users set acces_systeme = true where type in ('admin', 'federation', 'ligue', 'entente', 'club') and acces_systeme is null;

create table if not exists arbitres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  niveau text not null check (niveau in ('National', 'Intercontinental', 'International')),
  telephone text default '',
  email text default '',
  club text default '',
  grade text default '',
  parent_id uuid references users(id) on delete set null,
  statut text default 'actif',
  created_at timestamptz default now()
);

create index if not exists idx_arbitres_club on arbitres(club);
create index if not exists idx_arbitres_parent on arbitres(parent_id);
create index if not exists idx_arbitres_niveau on arbitres(niveau);
