-- Examens ceinture noire (Lien de Test + réponses + notation)
-- À exécuter dans le SQL Editor Supabase

create table if not exists judoka_grade_exams (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  instructeur_nom text not null default '',
  questions jsonb not null default '[]'::jsonb,
  request_ids jsonb not null default '[]'::jsonb,
  athletes jsonb not null default '[]'::jsonb,
  statut text not null default 'open'
    check (statut in ('open', 'closed')),
  federation_id uuid,
  created_by uuid,
  created_by_name text default '',
  created_at timestamptz default now(),
  closed_at timestamptz,
  chronometre_enabled boolean default false,
  chronometre_minutes integer,
  settings jsonb default '{}'::jsonb
);

alter table judoka_grade_exams add column if not exists chronometre_enabled boolean default false;
alter table judoka_grade_exams add column if not exists chronometre_minutes integer;
alter table judoka_grade_exams add column if not exists settings jsonb default '{}'::jsonb;

create index if not exists idx_grade_exams_token on judoka_grade_exams(token);
create index if not exists idx_grade_exams_statut on judoka_grade_exams(statut, created_at desc);

create table if not exists judoka_grade_exam_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references judoka_grade_exams(id) on delete cascade,
  request_id uuid,
  judoka_id uuid not null,
  judoka_numero_carte text default '',
  judoka_nom text default '',
  judoka_prenom text default '',
  grade_from text default '',
  grade_to text default '',
  answers jsonb not null default '[]'::jsonb,
  scores jsonb default '[]'::jsonb,
  total_score numeric,
  total_max numeric,
  reussi boolean,
  submitted_at timestamptz default now(),
  graded_at timestamptz,
  graded_by uuid,
  graded_by_name text default ''
);

create index if not exists idx_grade_exam_subs_exam on judoka_grade_exam_submissions(exam_id, submitted_at desc);
create unique index if not exists idx_grade_exam_subs_unique on judoka_grade_exam_submissions(exam_id, judoka_id);
