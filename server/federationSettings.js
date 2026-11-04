import { getFederationById, getUserFederationId, updateFederation, DEFAULT_JUDO_FEDERATION_ID } from './federations.js';
import { FEDERATION_ROLES } from './permissions.js';

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

export const DEFAULT_MENU_LABELS = {
  dashboard: 'Dashboard',
  create: 'Créer',
  messages: 'Messages',
  competition: 'Compétition',
  settings: 'Réglages',
  parametrage: 'Paramétrage',
  export: 'Exporter',
  scan_qr: 'Scan QR',
  grades: 'Grades',
};

export const DEFAULT_FEATURES = {
  competition: true,
  messages: true,
  scan_qr: true,
  transfers: true,
  grades: true,
  export: true,
  create_accounts: true,
};

const FEDERATION_ROLE_KEYS = Object.keys(FEDERATION_ROLES);

function defaultRolesEnabled() {
  return Object.fromEntries(FEDERATION_ROLE_KEYS.map((k) => [k, true]));
}

function defaultRoleLabels() {
  return Object.fromEntries(FEDERATION_ROLE_KEYS.map((k) => [k, k]));
}

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
    menu_labels: { ...DEFAULT_MENU_LABELS },
    role_labels: defaultRoleLabels(),
    roles_enabled: defaultRolesEnabled(),
    features: { ...DEFAULT_FEATURES },
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

function normalizeMenuLabels(input = {}) {
  const base = { ...DEFAULT_MENU_LABELS };
  for (const key of Object.keys(base)) {
    const val = String(input[key] || '').trim();
    if (val) base[key] = val.slice(0, 40);
  }
  return base;
}

function normalizeRoleLabels(input = {}) {
  const base = defaultRoleLabels();
  for (const key of FEDERATION_ROLE_KEYS) {
    const val = String(input[key] || '').trim();
    if (val) base[key] = val.slice(0, 60);
  }
  return base;
}

function normalizeRolesEnabled(input = {}) {
  const base = defaultRolesEnabled();
  for (const key of FEDERATION_ROLE_KEYS) {
    if (typeof input[key] === 'boolean') base[key] = input[key];
  }
  return base;
}

function normalizeFeatures(input = {}) {
  const base = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(base)) {
    if (typeof input[key] === 'boolean') base[key] = input[key];
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
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    colors: normalizeColors(src.colors || {}),
    labels: normalizeLabels(src.labels || {}),
    menu_labels: normalizeMenuLabels(src.menu_labels || {}),
    role_labels: normalizeRoleLabels(src.role_labels || {}),
    roles_enabled: normalizeRolesEnabled(src.roles_enabled || {}),
    features: normalizeFeatures(src.features || {}),
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

export function applySettingsToPermissions(perms, settings) {
  if (!perms || !settings?.features) return perms || {};
  const next = { ...perms };
  const f = settings.features;
  if (f.competition === false) {
    next.canManageCompetition = false;
    next.canToggleCompetitionAccess = false;
  }
  if (f.messages === false) next.canMessage = false;
  if (f.scan_qr === false) next.scanQr = false;
  if (f.export === false) next.export = false;
  if (f.transfers === false) {
    next.validateTransfers = false;
    next.validateTransfersLigue = false;
    next.requestTransfers = false;
  }
  if (f.grades === false) {
    next.manageGrades = false;
    next.manageBlackBelts = false;
    next.viewGradeHistory = false;
    next.manageClubGrades = false;
  }
  if (f.create_accounts === false) {
    next.createUsers = false;
    next.showHeaderCreate = false;
    next.createTypes = [];
  }
  return next;
}

export function getFederationRolesCatalog(settings) {
  const merged = mergeFederationSettings(settings);
  return FEDERATION_ROLE_KEYS.map((key) => ({
    key,
    label: merged.role_labels[key] || key,
    enabled: merged.roles_enabled[key] !== false,
  }));
}

export async function getFederationSettingsById(federationId) {
  const fed = await getFederationById(federationId);
  if (!fed) throw new Error('Fédération introuvable');
  return mergeFederationSettings(fed.settings);
}

export async function getFederationSettingsForUser(user) {
  if (!user || user.type === 'superadmin') {
    return getDefaultFederationSettings();
  }
  const fedId = getUserFederationId(user) || DEFAULT_JUDO_FEDERATION_ID;
  const fed = await getFederationById(fedId);
  return mergeFederationSettings(fed?.settings);
}

function buildNextSettings(current, patch = {}) {
  const next = mergeFederationSettings({
    colors: { ...current.colors, ...(patch.colors || {}) },
    labels: { ...current.labels, ...(patch.labels || {}) },
    menu_labels: { ...current.menu_labels, ...(patch.menu_labels || {}) },
    role_labels: { ...current.role_labels, ...(patch.role_labels || {}) },
    roles_enabled: { ...current.roles_enabled, ...(patch.roles_enabled || {}) },
    features: { ...current.features, ...(patch.features || {}) },
    card_visibility: current.card_visibility,
  });
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
  return next;
}

export async function saveFederationSettings(user, patch = {}) {
  if (!user || user.type !== 'admin') {
    throw new Error('Seul le compte Admin de la fédération peut modifier le paramétrage');
  }
  const fedId = getUserFederationId(user);
  if (!fedId) throw new Error('Fédération introuvable pour ce compte Admin');
  const current = await getFederationSettingsForUser(user);
  const next = buildNextSettings(current, patch);
  await updateFederation(fedId, { settings: next });
  return next;
}

export async function saveFederationSettingsById(federationId, patch = {}) {
  const fed = await getFederationById(federationId);
  if (!fed) throw new Error('Fédération introuvable');
  const current = mergeFederationSettings(fed.settings);
  const next = buildNextSettings(current, patch);
  await updateFederation(federationId, { settings: next });
  return next;
}
