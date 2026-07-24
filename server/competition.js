import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const settingsPath = path.join(dataDir, 'competition.json');
const registrationsPath = path.join(dataDir, 'competition_registrations.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DEFAULT_SETTINGS = {
  access_enabled: false,
  nom: '',
  date_debut: '',
  date_fin: '',
  lieu: '',
  description: '',
  public_enabled: false,
  public_token: '',
  updated_at: null,
};

function ensureDefaults(raw = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  if (!settings.public_token) {
    settings.public_token = uuidv4().replace(/-/g, '').slice(0, 16);
  }
  return settings;
}

function readSettingsJson() {
  if (!fs.existsSync(settingsPath)) {
    const initial = ensureDefaults();
    fs.writeFileSync(settingsPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  return ensureDefaults(JSON.parse(fs.readFileSync(settingsPath, 'utf-8')));
}

function writeSettingsJson(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function readRegistrationsJson() {
  if (!fs.existsSync(registrationsPath)) {
    fs.writeFileSync(registrationsPath, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(registrationsPath, 'utf-8'));
}

function writeRegistrationsJson(list) {
  fs.writeFileSync(registrationsPath, JSON.stringify(list, null, 2));
}

export async function getCompetitionSettings() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const initial = ensureDefaults();
        const { error: insertErr } = await getSupabase().from('competition_settings').upsert({
          id: 1,
          ...initial,
        });
        if (insertErr) throw insertErr;
        return initial;
      }
      return ensureDefaults(data);
    } catch (err) {
      console.warn('Lecture competition_settings impossible:', err.message);
      return readSettingsJson();
    }
  }
  return readSettingsJson();
}

export async function updateCompetitionSettings(patch) {
  const current = await getCompetitionSettings();
  const next = ensureDefaults({
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });

  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase().from('competition_settings').upsert({ id: 1, ...next });
      if (error) throw error;
      return next;
    } catch (err) {
      console.warn('Écriture competition_settings impossible:', err.message);
    }
  }

  writeSettingsJson(next);
  return next;
}

export function isCompetitionConfigured(settings) {
  return Boolean(settings?.nom?.trim() && settings?.date_debut && settings?.lieu?.trim());
}

export function toPublicCompetition(settings, extras = {}) {
  if (!settings?.public_enabled || !isCompetitionConfigured(settings)) return null;
  return {
    nom: settings.nom,
    date_debut: settings.date_debut,
    date_fin: settings.date_fin || '',
    lieu: settings.lieu,
    description: settings.description || '',
    public_token: settings.public_token,
    ...extras,
  };
}

export async function getCompetitionRegistrations() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_registrations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Lecture competition_registrations impossible:', err.message);
      return readRegistrationsJson().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  }
  return readRegistrationsJson().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function normCard(value) {
  return String(value || '').trim().toUpperCase();
}

function normDate(value) {
  return String(value || '').trim().slice(0, 10);
}

export async function findDuplicateCompetitionRegistration(payload) {
  const list = await getCompetitionRegistrations();

  if (payload.deja_enregistre) {
    const judokaId = payload.judoka_id || null;
    const carte = normCard(payload.numero_carte);
    return list.find((r) => {
      if (judokaId && r.judoka_id && String(r.judoka_id) === String(judokaId)) return true;
      if (carte && normCard(r.numero_carte) === carte) return true;
      return false;
    }) || null;
  }

  const nom = norm(payload.nom);
  const prenom = norm(payload.prenom);
  const dateNaissance = normDate(payload.date_naissance);
  const club = norm(payload.club);
  const email = norm(payload.email);

  return list.find((r) => (
    norm(r.nom) === nom
    && norm(r.prenom) === prenom
    && normDate(r.date_naissance) === dateNaissance
    && norm(r.club) === club
    && norm(r.email) === email
  )) || null;
}

export async function createCompetitionRegistration(payload) {
  const duplicate = await findDuplicateCompetitionRegistration(payload);
  if (duplicate) {
    throw new Error('Ce judoka est déjà inscrit à cette compétition');
  }

  const row = {
    id: uuidv4(),
    judoka_id: payload.judoka_id || null,
    numero_carte: payload.numero_carte || '',
    nom: payload.nom?.trim() || '',
    prenom: payload.prenom?.trim() || '',
    date_naissance: payload.date_naissance || '',
    sexe: payload.sexe || 'M',
    club: payload.club?.trim() || '',
    grade: payload.grade?.trim() || '',
    categorie: payload.categorie?.trim() || '',
    poids: payload.poids?.trim() || '',
    taille: payload.taille?.trim() || '',
    telephone: payload.telephone?.trim() || '',
    email: payload.email?.trim() || '',
    deja_enregistre: Boolean(payload.deja_enregistre),
    created_at: new Date().toISOString(),
  };

  if (!row.nom || !row.prenom) throw new Error('Nom et prénom obligatoires');
  if (!row.club) throw new Error('Le club est obligatoire');
  if (!row.date_naissance) throw new Error('La date de naissance est obligatoire');

  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase().from('competition_registrations').insert(row);
      if (error) throw error;
      return row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('Insert competition_registrations fallback JSON:', err.message);
    }
  }

  const list = readRegistrationsJson();
  list.push(row);
  writeRegistrationsJson(list);
  return row;
}

export async function getCompetitionRegistrationById(id) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_registrations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Lecture inscription compétition impossible:', err.message);
    }
  }
  return readRegistrationsJson().find((r) => r.id === id) || null;
}

export async function deleteCompetitionRegistration(id) {
  const existing = await getCompetitionRegistrationById(id);
  if (!existing) throw new Error('Inscription introuvable');

  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase()
        .from('competition_registrations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { success: true, id };
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('Suppression inscription compétition fallback JSON:', err.message);
    }
  }

  const list = readRegistrationsJson().filter((r) => r.id !== id);
  writeRegistrationsJson(list);
  return { success: true, id };
}

export async function updateCompetitionRegistrationWeight(id, poids) {
  const weight = String(poids ?? '').trim();
  if (!weight) throw new Error('Le poids est obligatoire');

  const existing = await getCompetitionRegistrationById(id);
  if (!existing) throw new Error('Inscription introuvable');
  if (existing.poids) throw new Error('Ce judoka a déjà été pesé');

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_registrations')
        .update({ poids: weight })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('Update poids compétition fallback JSON:', err.message);
    }
  }

  const list = readRegistrationsJson();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('Inscription introuvable');
  list[index] = { ...list[index], poids: weight };
  writeRegistrationsJson(list);
  return list[index];
}

export async function clearCompetitionRegistrations() {
  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase()
        .from('competition_registrations')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) {
        console.warn('Suppression inscriptions compétition fallback JSON:', err.message);
      }
    }
  }
  writeRegistrationsJson([]);
  return true;
}

export async function deleteCompetitionPublicLink() {
  await clearCompetitionRegistrations();
  const settings = await updateCompetitionSettings({
    public_enabled: false,
    public_token: uuidv4().replace(/-/g, '').slice(0, 16),
  });
  return settings;
}

export function toPublicRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    numero_carte: row.numero_carte || '',
    nom: row.nom,
    prenom: row.prenom,
    club: row.club || '',
    grade: row.grade || '',
    categorie: row.categorie || '',
    sexe: row.sexe || 'M',
    poids: row.poids || '',
    deja_enregistre: Boolean(row.deja_enregistre),
    created_at: row.created_at,
  };
}
