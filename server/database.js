import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase, isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'judokas.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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

export async function generateCardNumber() {
  const year = new Date().getFullYear();
  const judokas = await readAll();
  const prefix = `FCJ-${year}-`;

  const last = judokas
    .filter((j) => /^(FCJ|FJC)-/.test(j.numero_carte) && j.numero_carte.includes(`-${year}-`))
    .map((j) => parseInt(j.numero_carte.split('-')[2], 10))
    .sort((a, b) => b - a)[0];

  const nextNum = (last || 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export async function createJudoka(data) {
  const row = {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('judokas').insert(row);
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
    const { error } = await getSupabase().from('judokas').update(payload).eq('id', id);
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
