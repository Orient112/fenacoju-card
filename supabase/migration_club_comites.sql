-- Comités du club (Nom + Titre, liste dynamique)
alter table users
  add column if not exists comites jsonb default '[]'::jsonb;
