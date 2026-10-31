import { getFederationById, getUserFederationId, updateFederation, DEFAULT_JUDO_FEDERATION_ID } from './federations.js';

export const DEFAULT_FEDERATION_LABELS = {
  judokas: 'Athlètes',
  clubs: 'Clubs',
  ligues: 'Ligues',
  ententes: 'Ententes',
  entraineurs: 'Entraineurs',
  arbitres: 'Arbitres',
  federation: 'Membres',
};

export const DASHBOARD_CARD_KEYS = Object.keys(DEFAULT_FEDERATION_LABELS);

export const DEFAULT_FEDERATION_COLORS = {
  primary: '#1D4393',
  primary_light: '#2a5cb8',
  primary_dark: '#122d66',
  accent: '#e30613',
  bg: '#eef3fa',
};

const DEFAULT_VISIBILITY = {
  admin: {
    judokas: true,
    ligues: true,
    ententes: true,
    clubs: true,
    entraineurs: true,
    arbitres: true,
    federation: true,
  },
  club: {
    judokas: true,
    ligues: false,
    ententes: false,
    clubs: false,
    entraineurs: true,
    arbitres: false,
    federation: false,
  },
  ligue: {
    judokas: true,
    ligues: false,
    ententes: true,
    clubs: true,
    entraineurs: true,
    arbitres: false,
    federation: false,
  },
  entente: {
    judokas: true,
    ligues: false,
    ententes: false,
    clubs: true,
    entraineurs: true,
    arbitres: false,
    federation: false,
  },
  federation: {
    judokas: true,
    ligues: true,
    ententes: true,
    clubs: true,
    entraineurs: true,
    arbitres: true,
    federation: true,
  },
};

export function getDefaultFederationSettings() {
  return {
    colors: { ...DEFAULT_FEDERATION_COLORS },
    labels: { ...DEFAULT_FEDERATION_LABELS },
    card_visibility: JSON.parse(JSON.stringify(DEFAULT_VISIBILITY)),
  };
}

function normalizeColors(input = {}) {
  const base = { ...DEFAULT_FEDERATION_COLORS };
  for (const key of Object.keys(base)) {
    const val = String(input[key] || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) base[key] = val;
  }
  return base;
}

function normalizeLabels(input = {}) {
  const base = { ...DEFAULT_FEDERATION_LABELS };
  for (const key of DASHBOARD_CARD_KEYS) {
    const val = String(input[key] || '').trim();
    if (val) base[key] = val.slice(0, 40);
  }
  return base;
}

function normalizeVisibility(input = {}) {
  const base = JSON.parse(JSON.stringify(DEFAULT_VISIBILITY));
  for (const role of Object.keys(base)) {
    const row = input[role] || {};
    for (const key of DASHBOARD_CARD_KEYS) {
      if (typeof row[key] === 'boolean') base[role][key] = row[key];
    }
  }
  return base;
}

export function mergeFederationSettings(raw) {
  const defaults = getDefaultFederationSettings();
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    colors: normalizeColors(src.colors || {}),
    labels: normalizeLabels(src.labels || {}),
    card_visibility: normalizeVisibility(src.card_visibility || {}),
  };
}

export function getAccountVisibilityKey(user) {
  if (!user) return 'federation';
  if (user.type === 'admin') return 'admin';
  if (user.type === 'club') return 'club';
  if (user.type === 'ligue') return 'ligue';
  if (user.type === 'entente') return 'entente';
  return 'federation';
}

export async function getFederationSettingsForUser(user) {
  if (!user || user.type === 'superadmin') {
    return getDefaultFederationSettings();
  }
  const fedId = getUserFederationId(user) || DEFAULT_JUDO_FEDERATION_ID;
  const fed = await getFederationById(fedId);
  return mergeFederationSettings(fed?.settings);
}

export async function saveFederationSettings(user, patch = {}) {
  if (!user || user.type !== 'admin') {
    throw new Error('Seul le compte Admin de la fédération peut modifier le paramétrage');
  }
  const fedId = getUserFederationId(user);
  if (!fedId) throw new Error('Fédération introuvable pour ce compte Admin');
  const current = await getFederationSettingsForUser(user);
  const next = mergeFederationSettings({
    colors: { ...current.colors, ...(patch.colors || {}) },
    labels: { ...current.labels, ...(patch.labels || {}) },
    card_visibility: { ...current.card_visibility, ...(patch.card_visibility || {}) },
  });
  // Deep-merge visibility roles
  if (patch.card_visibility) {
    next.card_visibility = normalizeVisibility({
      ...current.card_visibility,
      ...Object.fromEntries(
        Object.entries(patch.card_visibility).map(([role, cards]) => [
          role,
          { ...(current.card_visibility[role] || {}), ...cards },
        ])
      ),
    });
  }
  await updateFederation(fedId, { settings: next });
  return next;
}
