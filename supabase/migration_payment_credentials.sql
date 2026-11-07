-- Identifiants SimplyPaye par compte (Directeur Compétition / Entente)
alter table users add column if not exists payment_merchant_code text;
alter table users add column if not exists payment_api_key text;
