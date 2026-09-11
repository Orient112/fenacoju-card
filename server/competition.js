import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';

const settingsPath = path.join(dataDir, 'competition.json');
const registrationsPath = path.join(dataDir, 'competition_registrations.json');

const DEFAULT_SETTINGS = {
  access_enabled: false,
  nom: '',
  date_debut: '',
  date_fin: '',
  lieu: '',
  description: '',
  public_enabled: false,
  public_token: '',
  categories_poids: [],
  updated_at: null,
};

const META_RE = /\n?<!--FENACOJU_META:([\s\S]*?)-->\s*$/;
const TEAM_MODE_MARK = '__mode_equipe__';

function parseCategoriesPoids(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).replace(',', '.').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseCategoriesPoids(parsed);
    } catch {
      return raw.split(/[;,]/).map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

export function getRegistrationMode(row) {
  if (row?.mode_inscription === 'equipe' || row?.taille === TEAM_MODE_MARK) return 'equipe';
  return 'individuel';
}

function ensureDefaults(raw = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  if (!settings.public_token) {
    settings.public_token = uuidv4().replace(/-/g, '').slice(0, 16);
  }
  settings.categories_poids = parseCategoriesPoids(settings.categories_poids);
  const desc = String(settings.description || '');
  const metaMatch = desc.match(META_RE);
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      if (!settings.categories_poids.length && Array.isArray(meta.categories_poids)) {
        settings.categories_poids = parseCategoriesPoids(meta.categories_poids);
      }
    } catch {
      // ignore meta
    }
    settings.description = desc.replace(META_RE, '').trimEnd();
  }
  return settings;
}

function toDbSettings(settings) {
  const cats = parseCategoriesPoids(settings.categories_poids);
  const cleanDesc = String(settings.description || '').replace(META_RE, '').trimEnd();
  return {
    id: 1,
    access_enabled: Boolean(settings.access_enabled),
    nom: settings.nom || '',
    date_debut: settings.date_debut || null,
    date_fin: settings.date_fin || null,
    lieu: settings.lieu || '',
    description: `${cleanDesc}\n<!--FENACOJU_META:${JSON.stringify({ categories_poids: cats })}-->`,
    public_enabled: Boolean(settings.public_enabled),
    public_token: settings.public_token || '',
    updated_at: settings.updated_at,
  };
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
        const { error: insertErr } = await getSupabase().from('competition_settings').upsert(
          toDbSettings(initial)
        );
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
      const { error } = await getSupabase().from('competition_settings').upsert(toDbSettings(next));
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
    categories_poids: parseCategoriesPoids(settings.categories_poids),
    ...extras,
  };
}

function withRegistrationMode(list) {
  return (list || []).map((r) => ({
    ...r,
    mode_inscription: getRegistrationMode(r),
  }));
}

export async function getCompetitionRegistrations() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_registrations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return withRegistrationMode(data || []);
    } catch (err) {
      console.warn('Lecture competition_registrations impossible:', err.message);
      return withRegistrationMode(
        readRegistrationsJson().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      );
    }
  }
  return withRegistrationMode(
    readRegistrationsJson().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  );
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

  const dejaEnregistre = Boolean(payload.deja_enregistre);
  const modeInscription = payload.mode_inscription === 'equipe' ? 'equipe' : 'individuel';
  const poids = modeInscription === 'equipe'
    ? String(payload.poids ?? '').trim()
    : String(payload.poids ?? '').trim();
  const row = {
    id: uuidv4(),
    judoka_id: dejaEnregistre ? (payload.judoka_id || null) : null,
    numero_carte: dejaEnregistre ? (payload.numero_carte || '') : '',
    nom: payload.nom?.trim() || '',
    prenom: payload.prenom?.trim() || '',
    date_naissance: payload.date_naissance || '',
    sexe: payload.sexe || 'M',
    club: payload.club?.trim() || '',
    grade: payload.grade?.trim() || '',
    categorie: payload.categorie?.trim() || '',
    poids,
    taille: modeInscription === 'equipe' ? TEAM_MODE_MARK : '',
    telephone: payload.telephone?.trim() || '',
    email: payload.email?.trim() || '',
    deja_enregistre: dejaEnregistre,
    mode_inscription: modeInscription,
    created_at: new Date().toISOString(),
  };

  if (!row.nom || !row.prenom) throw new Error('Nom et prénom obligatoires');
  if (!row.club) throw new Error('Le club est obligatoire');
  if (!row.date_naissance) throw new Error('La date de naissance est obligatoire');
  if (modeInscription === 'equipe' && !row.poids) {
    throw new Error('La catégorie de poids est obligatoire pour le mode Par équipe');
  }

  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase().from('competition_registrations').insert(row);
      if (error) throw error;
      return row;
    } catch (err) {
      const { mode_inscription, ...withoutMode } = row;
      try {
        const { error } = await getSupabase().from('competition_registrations').insert(withoutMode);
        if (error) throw error;
        return row;
      } catch (inner) {
        if (!/relation|does not exist|schema cache|column/i.test(inner.message || err.message || '')) throw inner;
        console.warn('Insert competition_registrations fallback JSON:', inner.message || err.message);
      }
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

export async function updateCompetitionRegistration(id, patch = {}) {
  const existing = await getCompetitionRegistrationById(id);
  if (!existing) throw new Error('Inscription introuvable');

  const next = { ...existing };
  if (patch.nom !== undefined) next.nom = String(patch.nom || '').trim();
  if (patch.prenom !== undefined) next.prenom = String(patch.prenom || '').trim();
  if (patch.poids !== undefined) next.poids = String(patch.poids ?? '').trim();
  if (!next.nom || !next.prenom) throw new Error('Nom et prénom obligatoires');

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('competition_registrations')
        .update({ nom: next.nom, prenom: next.prenom, poids: next.poids })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
      console.warn('Update inscription compétition fallback JSON:', err.message);
    }
  }

  const list = readRegistrationsJson();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('Inscription introuvable');
  list[index] = next;
  writeRegistrationsJson(list);
  return next;
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

/** Efface toute la compétition (params, inscriptions, lien) — utilisé quand Admin/Coordon passe Off. */
export async function resetCompetitionCompletely({ access_enabled = false } = {}) {
  await clearCompetitionRegistrations();
  return updateCompetitionSettings({
    access_enabled: Boolean(access_enabled),
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
    public_enabled: false,
    public_token: uuidv4().replace(/-/g, '').slice(0, 16),
    categories_poids: [],
  });
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
    mode_inscription: getRegistrationMode(row),
    created_at: row.created_at,
  };
}
