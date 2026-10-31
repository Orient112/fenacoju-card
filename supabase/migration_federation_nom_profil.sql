-- Nom affiché dans la bande des menus (profil / marque)
alter table federations add column if not exists nom_profil text default '';
