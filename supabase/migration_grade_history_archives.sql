-- Archives des historiques de passation réinitialisés par le Responsable Grade
-- Visible ensuite dans le menu Historique de l'Admin fédération

create table if not exists judoka_grade_history_archives (
  id uuid primary key default gen_random_uuid(),
  federation_id uuid,
  reset_by uuid,
  reset_by_name text default '',
  created_at timestamptz default now(),
  exams jsonb not null default '[]'::jsonb,
  submissions jsonb not null default '[]'::jsonb,
  grade_history jsonb not null default '[]'::jsonb,
  exams_count integer default 0,
  submissions_count integer default 0,
  history_count integer default 0
);

create index if not exists idx_grade_history_archives_fed
  on judoka_grade_history_archives(federation_id, created_at desc);
