-- Paramétrage fédération (couleurs, libellés, cases Dashboard)
alter table federations add column if not exists settings jsonb default '{}'::jsonb;
