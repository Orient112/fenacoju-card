-- Migration : taille et poids des judokas
-- Coller dans Supabase → SQL Editor

alter table judokas add column if not exists taille text default '';
alter table judokas add column if not exists poids text default '';
