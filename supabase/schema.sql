-- FENACOJU Card — Schéma Supabase
-- Exécutez ce script dans Supabase → SQL Editor

create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('admin', 'federation', 'ligue', 'entente', 'club', 'entraineur', 'membre')),
  username text,
  email text unique not null,
  password text not null,
  nom text,
  prenom text,
  fonction text,
  nom_club text,
  nom_organisation text,
  ville text,
  responsable text,
  club text,
  grade text,
  telephone text default '',
  documents jsonb default '{}'::jsonb,
  comites jsonb default '[]'::jsonb,
  statut text not null default 'actif' check (statut in ('pending', 'actif', 'rejete')),
  acces_systeme boolean default true,
  parent_id uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_users_parent_id on users(parent_id);
create index if not exists idx_users_statut on users(statut);
create index if not exists idx_users_type on users(type);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at bigint not null
);

create index if not exists idx_sessions_user_id on sessions(user_id);

create table if not exists judokas (
  id uuid primary key default gen_random_uuid(),
  numero_carte text unique not null,
  nom text not null,
  prenom text not null,
  date_naissance date not null,
  sexe text not null default 'M',
  club text not null,
  grade text not null,
  categorie text default '',
  numero_licence text default '',
  telephone text default '',
  email text default '',
  taille text default '',
  poids text default '',
  photo text default '',
  entraineur_id text default '',
  entraineur_nom text default '',
  date_inscription date default current_date,
  statut text default 'actif',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_judokas_club on judokas(club);
create index if not exists idx_judokas_numero on judokas(numero_carte);

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

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references users(id) on delete cascade,
  to_id uuid not null references users(id) on delete cascade,
  subject text default '',
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_messages_to on messages(to_id);
create index if not exists idx_messages_from on messages(from_id);

create table if not exists competition_settings (
  id integer primary key check (id = 1),
  access_enabled boolean not null default false,
  nom text default '',
  date_debut date,
  date_fin date,
  lieu text default '',
  description text default '',
  public_enabled boolean not null default false,
  public_token text not null default '',
  updated_at timestamptz
);

insert into competition_settings (id, access_enabled, public_token)
values (1, false, replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create table if not exists competition_registrations (
  id uuid primary key default gen_random_uuid(),
  judoka_id uuid,
  numero_carte text default '',
  nom text not null,
  prenom text not null,
  date_naissance date,
  sexe text default 'M',
  club text not null,
  grade text default '',
  categorie text default '',
  poids text default '',
  taille text default '',
  telephone text default '',
  email text default '',
  deja_enregistre boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_competition_registrations_created
  on competition_registrations(created_at desc);

insert into storage.buckets (id, name, public)
values ('fenacoju-uploads', 'fenacoju-uploads', true)
on conflict (id) do update set public = true;
