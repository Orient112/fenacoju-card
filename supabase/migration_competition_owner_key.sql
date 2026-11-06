-- Compétitions séparées : Directeur (federation) vs chaque Entente (entente:{id})
alter table competition_settings add column if not exists owner_key text default 'federation';
alter table competition_registrations add column if not exists owner_key text default 'federation';

update competition_settings set owner_key = 'federation' where owner_key is null or owner_key = '';
update competition_registrations set owner_key = 'federation' where owner_key is null or owner_key = '';

drop index if exists idx_competition_settings_federation;

create unique index if not exists idx_competition_settings_fed_owner
  on competition_settings(federation_id, owner_key)
  where federation_id is not null;

create index if not exists idx_registrations_owner_key
  on competition_registrations(owner_key);
