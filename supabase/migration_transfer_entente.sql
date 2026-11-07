-- Transferts : étape Entente avant Ligue puis Fédération (SG)
-- À exécuter dans le SQL Editor Supabase

alter table judoka_transfers
  add column if not exists entente_validated_by uuid,
  add column if not exists entente_validated_by_name text default '',
  add column if not exists entente_validated_at timestamptz;

alter table judoka_transfers drop constraint if exists judoka_transfers_statut_check;

alter table judoka_transfers
  add constraint judoka_transfers_statut_check
  check (statut in (
    'pending_entente',
    'pending_ligue',
    'pending_federation',
    'accepte',
    'rejete',
    'annule'
  ));

alter table judoka_transfers alter column statut set default 'pending_entente';
