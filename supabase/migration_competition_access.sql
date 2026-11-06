-- Activation compétition Entente persistante (source de vérité durable)
alter table users add column if not exists competition_access boolean default false;
