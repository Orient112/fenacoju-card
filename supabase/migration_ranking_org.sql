-- Ligue / Entente sur les résultats Ranking
alter table ranking_results add column if not exists ligue_id uuid;
alter table ranking_results add column if not exists ligue_nom text;
alter table ranking_results add column if not exists entente_id uuid;
alter table ranking_results add column if not exists entente_nom text;

create index if not exists ranking_results_ligue_idx on ranking_results (federation_id, ligue_id);
create index if not exists ranking_results_entente_idx on ranking_results (federation_id, entente_id);
