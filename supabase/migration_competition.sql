-- Migration : compétition (paramètres + inscriptions publiques)

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
create index if not exists idx_competition_registrations_carte
  on competition_registrations(numero_carte);
