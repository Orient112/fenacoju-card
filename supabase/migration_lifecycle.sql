-- Fiche de suivi, passations de grade, transferts judokas
-- À exécuter dans le SQL Editor Supabase

create table if not exists judoka_events (
  id uuid primary key default gen_random_uuid(),
  judoka_id uuid not null references judokas(id) on delete cascade,
  type text not null,
  titre text not null,
  detail text default '',
  meta jsonb default '{}'::jsonb,
  created_by uuid,
  created_by_name text default '',
  created_at timestamptz default now()
);

create index if not exists idx_judoka_events_judoka on judoka_events(judoka_id, created_at desc);

create table if not exists judoka_grade_history (
  id uuid primary key default gen_random_uuid(),
  judoka_id uuid not null references judokas(id) on delete cascade,
  grade_from text default '',
  grade_to text not null,
  instructeur_id uuid,
  instructeur_nom text default '',
  points numeric,
  note text default '',
  changed_by uuid,
  changed_by_name text default '',
  created_at timestamptz default now()
);

create index if not exists idx_grade_history_judoka on judoka_grade_history(judoka_id, created_at desc);
create index if not exists idx_grade_history_black on judoka_grade_history(grade_to, created_at desc);

create table if not exists judoka_transfers (
  id uuid primary key default gen_random_uuid(),
  judoka_id uuid not null references judokas(id) on delete cascade,
  club_from text not null,
  club_to text not null,
  statut text not null default 'pending_ligue'
    check (statut in ('pending_ligue', 'pending_federation', 'accepte', 'rejete', 'annule')),
  requested_by uuid,
  requested_by_name text default '',
  ligue_validated_by uuid,
  ligue_validated_by_name text default '',
  federation_validated_by uuid,
  federation_validated_by_name text default '',
  motif text default '',
  created_at timestamptz default now(),
  ligue_validated_at timestamptz,
  federation_validated_at timestamptz
);

create index if not exists idx_transfers_judoka on judoka_transfers(judoka_id, created_at desc);
create index if not exists idx_transfers_statut on judoka_transfers(statut);
