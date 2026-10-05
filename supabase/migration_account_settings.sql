-- Photo de profil utilisateur + masquage messages
-- Exécutez dans Supabase → SQL Editor

alter table if exists users
  add column if not exists photo text default '';

alter table if exists messages
  add column if not exists hidden_for jsonb default '[]'::jsonb;
