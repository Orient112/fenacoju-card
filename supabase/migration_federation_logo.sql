-- Logo des fédérations (SuperAdmin)
alter table federations add column if not exists logo_url text default '';
