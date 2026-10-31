-- Multi-fédérations : SuperAdmin → Admin (= une fédération isolée)
-- À exécuter dans le SQL Editor Supabase

-- 1) Table des fédérations
create table if not exists federations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  slug text unique,
  admin_user_id uuid,
  created_at timestamptz default now()
);

-- 2) Colonne federation_id sur les tables métier
alter table users add column if not exists federation_id uuid references federations(id) on delete set null;
alter table judokas add column if not exists federation_id uuid references federations(id) on delete set null;
alter table arbitres add column if not exists federation_id uuid references federations(id) on delete set null;
alter table messages add column if not exists federation_id uuid references federations(id) on delete set null;
alter table competition_registrations add column if not exists federation_id uuid references federations(id) on delete set null;

-- competition_settings : passer du singleton id=1 à une ligne par fédération
alter table competition_settings drop constraint if exists competition_settings_pkey;
alter table competition_settings drop constraint if exists competition_settings_id_check;
alter table competition_settings add column if not exists federation_id uuid references federations(id) on delete cascade;
-- garder id comme clé technique auto
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'competition_settings_pkey'
  ) then
    alter table competition_settings alter column id drop default;
    -- si id n'est pas serial, on le laisse ; on indexe federation_id
  end if;
exception when others then
  null;
end $$;

create unique index if not exists idx_competition_settings_federation
  on competition_settings(federation_id)
  where federation_id is not null;

create index if not exists idx_users_federation on users(federation_id);
create index if not exists idx_judokas_federation on judokas(federation_id);
create index if not exists idx_arbitres_federation on arbitres(federation_id);
create index if not exists idx_registrations_federation on competition_registrations(federation_id);

-- Autoriser type superadmin dans users (si contrainte check stricte)
alter table users drop constraint if exists users_type_check;
alter table users add constraint users_type_check
  check (type in ('superadmin', 'admin', 'federation', 'ligue', 'entente', 'club', 'entraineur', 'membre'));

-- 3) Fédération Judo par défaut pour les données existantes
insert into federations (id, nom, slug, created_at)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Fédération Nationale Congolaise de Judo',
  'fenacoju-judo',
  now()
where not exists (
  select 1 from federations where slug = 'fenacoju-judo'
);

update users
set federation_id = '00000000-0000-4000-8000-000000000001'::uuid
where federation_id is null and type <> 'superadmin';

update judokas
set federation_id = '00000000-0000-4000-8000-000000000001'::uuid
where federation_id is null;

update arbitres
set federation_id = '00000000-0000-4000-8000-000000000001'::uuid
where federation_id is null;

update competition_registrations
set federation_id = '00000000-0000-4000-8000-000000000001'::uuid
where federation_id is null;

update competition_settings
set federation_id = '00000000-0000-4000-8000-000000000001'::uuid
where federation_id is null;

update federations f
set admin_user_id = u.id
from users u
where f.id = '00000000-0000-4000-8000-000000000001'::uuid
  and u.type = 'admin'
  and f.admin_user_id is null;
