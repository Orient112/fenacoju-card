import fs from 'fs';
import path from 'path';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const dbPath = path.join(dataDir, 'judokas.json');

if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([], null, 2));

function readAllJson() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

function writeAllJson(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

async function readAll() {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('judokas').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return readAllJson();
}

function filterSearch(judokas, search) {
  if (!search) return judokas;
  const term = search.toLowerCase();
  return judokas.filter(
    (j) =>
      j.nom?.toLowerCase().includes(term) ||
      j.prenom?.toLowerCase().includes(term) ||
      j.numero_carte?.toLowerCase().includes(term) ||
      j.club?.toLowerCase().includes(term)
  );
}

export async function getAllJudokas(search = '') {
  let judokas = await readAll();
  judokas = filterSearch(judokas, search);
  return judokas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getJudokaById(id) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('judokas').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  return readAllJson().find((j) => j.id === id) || null;
}

export async function findJudokaByIdentity({ nom, prenom, date_naissance, club } = {}) {
  const n = String(nom || '').trim().toLowerCase();
  const p = String(prenom || '').trim().toLowerCase();
  const d = String(date_naissance || '').trim().slice(0, 10);
  const c = String(club || '').trim().toLowerCase();
  if (!n || !p) return null;
  const all = await readAll();
  return all.find((j) => (
    String(j.nom || '').trim().toLowerCase() === n
    && String(j.prenom || '').trim().toLowerCase() === p
    && (!d || String(j.date_naissance || '').slice(0, 10) === d)
    && (!c || String(j.club || '').trim().toLowerCase() === c)
  )) || null;
}

export async function getJudokaByCardNumber(numero_carte) {
  const raw = String(numero_carte || '').trim().toUpperCase();
  if (!raw) return null;

  const variants = [raw];
  if (raw.startsWith('FJC-')) variants.push(`FCJ-${raw.slice(4)}`);
  if (raw.startsWith('FCJ-')) variants.push(`FJC-${raw.slice(4)}`);

  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('judokas')
      .select('*')
      .in('numero_carte', variants);
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  }

  const judokas = readAllJson();
  return judokas.find((j) => variants.includes(j.numero_carte?.toUpperCase())) || null;
}

/**
 * ID carte par fédération : {PREFIX}-{YEAR}-{NNNN}
 * PREFIX vient du design de la fédération (ex. FCJ pour Judo).
 */
export async function generateCardNumber({ prefix = 'FCJ', federationId = null } = {}) {
  const year = new Date().getFullYear();
  const judokas = await readAll();
  const safePrefix = String(prefix || 'FCJ')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5) || 'FCJ';
  const re = new RegExp(`^${safePrefix}-\\d{4}-\\d+$`, 'i');
  const legacyJudo = /^(FCJ|FJC)-\d{4}-\d+$/i;

  const last = judokas
    .filter((j) => {
      const num = String(j.numero_carte || '');
      if (federationId && j.federation_id && String(j.federation_id) !== String(federationId)) {
        return false;
      }
      if (safePrefix === 'FCJ') {
        return legacyJudo.test(num) && num.includes(`-${year}-`);
      }
      return re.test(num) && num.includes(`-${year}-`);
    })
    .map((j) => parseInt(String(j.numero_carte).split('-').pop(), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];

  const nextNum = (last || 0) + 1;
  return `${safePrefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

export async function createJudoka(data) {
  const row = {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    let { error } = await getSupabase().from('judokas').insert(row);
    // Colonnes optionnelles absentes (migration non appliquée) → réessayer sans elles
    if (error && /taille|poids|federation_id|column|schema cache/i.test(error.message || '')) {
      const { taille, poids, federation_id, ...rest } = row;
      ({ error } = await getSupabase().from('judokas').insert(rest));
      if (error && /taille|poids|column|schema cache/i.test(error.message || '')) {
        const { taille: _t, poids: _p, ...minimal } = rest;
        ({ error } = await getSupabase().from('judokas').insert(minimal));
      }
    }
    if (error) throw new Error(error.message);
    return;
  }

  const judokas = readAllJson();
  judokas.push(row);
  writeAllJson(judokas);
}

export async function updateJudoka(id, data) {
  const payload = { ...data, updated_at: new Date().toISOString() };

  if (isSupabaseEnabled()) {
    let { error } = await getSupabase().from('judokas').update(payload).eq('id', id);
    if (error && /taille|poids|column|schema cache/i.test(error.message || '')) {
      const { taille, poids, ...rest } = payload;
      ({ error } = await getSupabase().from('judokas').update(rest).eq('id', id));
    }
    if (error) throw new Error(error.message);
    return;
  }

  const judokas = readAllJson();
  const index = judokas.findIndex((j) => j.id === id);
  if (index === -1) return;
  judokas[index] = { ...judokas[index], ...payload };
  writeAllJson(judokas);
}

export async function deleteJudoka(id) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('judokas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  writeAllJson(readAllJson().filter((j) => j.id !== id));
}
