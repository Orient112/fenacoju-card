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
    public_token: current.public_token || patch.public_token,
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

export function toPublicCompetition(settings) {
  if (!settings?.public_enabled || !isCompetitionConfigured(settings)) return null;
  return {
    nom: settings.nom,
    date_debut: settings.date_debut,
    date_fin: settings.date_fin || '',
    lieu: settings.lieu,
    description: settings.description || '',
    public_token: settings.public_token,
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

export async function createCompetitionRegistration(payload) {
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
