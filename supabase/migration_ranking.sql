-- Module Ranking national (par fédération)
create table if not exists ranking_rules (
  federation_id uuid primary key,
  season_label text default 'Saison en cours',
  best_results_count int default 4,
  levels jsonb default '[]'::jsonb,
  result_coefficients jsonb default '[]'::jsonb,
  tie_breakers jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid
);

create table if not exists ranking_results (
  id uuid primary key,
  federation_id uuid not null,
  judoka_id uuid,
  judoka_nom text,
  judoka_prenom text,
  judoka_club text,
  judoka_sexe text,
  categorie_age text,
  categorie_poids text,
  competition_name text,
  competition_level text,
  place int,
  wins int default 0,
  gold_medals int default 0,
  points numeric default 0,
  counted boolean default true,
  season_label text,
  competition_date date,
  note text default '',
  created_by uuid,
  created_by_name text,
  created_at timestamptz default now()
);

create index if not exists ranking_results_fed_idx on ranking_results (federation_id, season_label);
create index if not exists ranking_results_judoka_idx on ranking_results (judoka_id);
create index if not exists ranking_results_cat_idx on ranking_results (federation_id, categorie_poids, judoka_sexe);
