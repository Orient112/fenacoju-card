import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'arbitres.json');

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
    const { data, error } = await getSupabase().from('arbitres').select('*');
    if (error) {
      // Table absente ou pas encore migrée : ne pas faire planter tout le dashboard
      console.warn('Lecture arbitres impossible:', error.message);
      return [];
    }
    return data || [];
  }
  return readAllJson();
}

export const ARBITRE_NIVEAUX = ['National', 'Intercontinental', 'International'];

export async function getAllArbitres(search = '') {
  let list = await readAll();
  if (search) {
    const term = search.toLowerCase();
    list = list.filter(
      (a) =>
        a.nom?.toLowerCase().includes(term) ||
        a.prenom?.toLowerCase().includes(term) ||
        a.club?.toLowerCase().includes(term) ||
        a.niveau?.toLowerCase().includes(term) ||
        a.email?.toLowerCase().includes(term)
    );
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getArbitreById(id) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase().from('arbitres').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  return readAllJson().find((a) => a.id === id) || null;
}

export async function createArbitre(payload) {
  const row = {
    id: payload.id || uuidv4(),
    nom: payload.nom,
    prenom: payload.prenom,
    niveau: payload.niveau,
    telephone: payload.telephone || '',
    email: payload.email || '',
    club: payload.club || '',
    grade: payload.grade || '',
    parent_id: payload.parent_id || null,
    statut: payload.statut || 'actif',
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('arbitres').insert(row);
    if (error) throw new Error(error.message);
    return row;
  }

  const list = readAllJson();
  list.push(row);
  writeAllJson(list);
  return row;
}

export async function updateArbitre(id, payload) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('arbitres')
      .update({
        nom: payload.nom,
        prenom: payload.prenom,
        niveau: payload.niveau,
        telephone: payload.telephone || '',
        email: payload.email || '',
        club: payload.club || '',
        grade: payload.grade || '',
        statut: payload.statut || 'actif',
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const list = readAllJson();
  const index = list.findIndex((a) => a.id === id);
  if (index === -1) return null;
  list[index] = { ...list[index], ...payload };
  writeAllJson(list);
  return list[index];
}

export async function deleteArbitre(id) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('arbitres').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  writeAllJson(readAllJson().filter((a) => a.id !== id));
}
