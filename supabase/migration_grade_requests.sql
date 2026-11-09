-- Demandes de passation ceinture noire (Club → Responsable Grade)
-- À exécuter dans le SQL Editor Supabase

create table if not exists judoka_grade_requests (
  id uuid primary key default gen_random_uuid(),
  judoka_id uuid not null references judokas(id) on delete cascade,
  grade_from text not null default '',
  grade_to text not null,
  statut text not null default 'pending'
    check (statut in ('pending', 'accepte', 'rejete')),
  date_passation date,
  note text default '',
  requested_by uuid,
  requested_by_name text default '',
  resolved_by uuid,
  resolved_by_name text default '',
  resolved_at timestamptz,
  judoka_nom text default '',
  judoka_prenom text default '',
  judoka_club text default '',
  judoka_numero_carte text default '',
  federation_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_grade_requests_statut on judoka_grade_requests(statut, created_at desc);
create index if not exists idx_grade_requests_judoka on judoka_grade_requests(judoka_id, created_at desc);
create index if not exists idx_grade_requests_fed on judoka_grade_requests(federation_id, statut);
