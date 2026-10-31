-- Activation / désactivation d'une fédération (données conservées)
alter table federations add column if not exists actif boolean default true;
update federations set actif = true where actif is null;
