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
  settings: 'Réglages Profil',
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

export const DEFAULT_FEATURE_DEFS = [
  { key: 'competition', label: 'Compétition', system: true },
  { key: 'messages', label: 'Messages', system: true },
  { key: 'scan_qr', label: 'Scan QR', system: true },
  { key: 'transfers', label: 'Transferts', system: true },
  { key: 'grades', label: 'Grades / passations', system: true },
  { key: 'export', label: 'Export PDF / CSV', system: true },
  { key: 'create_accounts', label: 'Création de comptes', system: true },
];

const FEDERATION_ROLE_KEYS = Object.keys(FEDERATION_ROLES);
const SYSTEM_COLOR_KEYS = Object.keys(DEFAULT_FEDERATION_COLORS);
const SYSTEM_MENU_KEYS = Object.keys(DEFAULT_MENU_LABELS);
const SYSTEM_FEATURE_KEYS = Object.keys(DEFAULT_FEATURES);

function defaultRolesEnabled() {
  return Object.fromEntries(FEDERATION_ROLE_KEYS.map((k) => [k, true]));
}

function defaultRoleLabels() {
  return Object.fromEntries(FEDERATION_ROLE_KEYS.map((k) => [k, k]));
}

function defaultRolesList() {
  return FEDERATION_ROLE_KEYS.map((key, order) => ({
    key,
    label: key,
    enabled: true,
    system: true,
    base: key,
    order,
  }));
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

function slugifyKey(value, fallback = 'item') {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return raw || fallback;
}

function rolesToMaps(roles = []) {
  return {
    role_labels: Object.fromEntries(roles.map((r) => [r.key, r.label])),
    roles_enabled: Object.fromEntries(roles.map((r) => [r.key, r.enabled !== false])),
  };
}

function normalizeRolesList(input, legacyLabels = {}, legacyEnabled = {}) {
  if (Array.isArray(input) && input.length > 0) {
    const seen = new Set();
    return input
      .map((item, idx) => {
        const key = String(item?.key || item?.label || '').trim().slice(0, 60);
        if (!key || seen.has(key)) return null;
        seen.add(key);
        const system = FEDERATION_ROLE_KEYS.includes(key) || item?.system === true;
        const baseCandidate = String(item?.base || '').trim();
        const base = FEDERATION_ROLE_KEYS.includes(baseCandidate)
          ? baseCandidate
          : (system ? key : 'Membre');
        return {
          key,
          label: String(item?.label || key).trim().slice(0, 60) || key,
          enabled: item?.enabled !== false,
          system: !!system,
          base,
          order: typeof item?.order === 'number' ? item.order : idx,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order)
      .map((role, order) => ({ ...role, order }));
  }

  return FEDERATION_ROLE_KEYS.map((key, order) => ({
    key,
    label: String(legacyLabels[key] || key).trim().slice(0, 60) || key,
    enabled: legacyEnabled[key] !== false,
    system: true,
    base: key,
    order,
  }));
}

export function getDefaultFederationSettings() {
  const roles = defaultRolesList();
  return {
    colors: { ...DEFAULT_FEDERATION_COLORS },
    color_defs: SYSTEM_COLOR_KEYS.map((key) => ({
      key,
      label: key,
      system: true,
    })),
    labels: { ...DEFAULT_FEDERATION_LABELS },
    menu_labels: { ...DEFAULT_MENU_LABELS },
    feature_defs: DEFAULT_FEATURE_DEFS.map((f) => ({ ...f })),
    roles,
    ...rolesToMaps(roles),
    features: { ...DEFAULT_FEATURES },
    card_visibility: JSON.parse(JSON.stringify(DEFAULT_VISIBILITY)),
  };
}

function normalizeColors(input = {}) {
  const base = {};
  const entries = Object.keys(input || {}).length ? input : DEFAULT_FEDERATION_COLORS;
  for (const [key, raw] of Object.entries(entries)) {
    const k = String(key || '').trim().slice(0, 40);
    const val = String(raw || '').trim();
    if (!k) continue;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) base[k] = val;
  }
  for (const key of SYSTEM_COLOR_KEYS) {
    if (!base[key]) base[key] = DEFAULT_FEDERATION_COLORS[key];
  }
  return base;
}

function normalizeColorDefs(input, colors = {}) {
  const colorKeys = Object.keys(colors);
  if (Array.isArray(input) && input.length) {
    const seen = new Set();
    return input
      .map((item, idx) => {
        const key = String(item?.key || '').trim().slice(0, 40);
        if (!key || seen.has(key) || !colors[key]) return null;
        seen.add(key);
        return {
          key,
          label: String(item?.label || key).trim().slice(0, 40) || key,
          system: SYSTEM_COLOR_KEYS.includes(key) || item?.system === true,
          order: typeof item?.order === 'number' ? item.order : idx,
        };
      })
      .filter(Boolean)
      .concat(
        colorKeys
          .filter((k) => !seen.has(k))
          .map((key, idx) => ({
            key,
            label: key,
            system: SYSTEM_COLOR_KEYS.includes(key),
            order: 1000 + idx,
          }))
      )
      .sort((a, b) => a.order - b.order)
      .map((item, order) => ({ ...item, order }));
  }
  return colorKeys.map((key, order) => ({
    key,
    label: key,
    system: SYSTEM_COLOR_KEYS.includes(key),
    order,
  }));
}

function normalizeDict(input = {}, defaults = {}, { keepDefaults = true, maxKey = 40, maxVal = 40 } = {}) {
  const base = keepDefaults ? { ...defaults } : {};
  for (const [key, raw] of Object.entries(input || {})) {
    const k = String(key || '').trim().slice(0, maxKey);
    const v = String(raw || '').trim().slice(0, maxVal);
    if (k && v) base[k] = v;
  }
  if (keepDefaults) {
    for (const [key, val] of Object.entries(defaults)) {
      if (!base[key]) base[key] = val;
    }
  }
  return base;
}

function normalizeFeatureDefs(input, features = {}) {
  if (Array.isArray(input) && input.length) {
    const seen = new Set();
    return input
      .map((item, idx) => {
        const key = slugifyKey(item?.key || item?.label, '');
        if (!key || seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          label: String(item?.label || key).trim().slice(0, 60) || key,
          system: SYSTEM_FEATURE_KEYS.includes(key) || item?.system === true,
          order: typeof item?.order === 'number' ? item.order : idx,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order)
      .map((item, order) => ({ ...item, order }));
  }
  const keys = [...new Set([...SYSTEM_FEATURE_KEYS, ...Object.keys(features || {})])];
  return keys.map((key, order) => ({
    key,
    label: DEFAULT_FEATURE_DEFS.find((f) => f.key === key)?.label || key,
    system: SYSTEM_FEATURE_KEYS.includes(key),
    order,
  }));
}

function normalizeFeatures(input = {}, defs = []) {
  const base = { ...DEFAULT_FEATURES };
  const keys = defs.length ? defs.map((d) => d.key) : Object.keys({ ...DEFAULT_FEATURES, ...input });
  for (const key of keys) {
    if (typeof input[key] === 'boolean') base[key] = input[key];
    else if (!(key in base)) base[key] = true;
  }
  for (const key of Object.keys(base)) {
    if (defs.length && !defs.some((d) => d.key === key) && !SYSTEM_FEATURE_KEYS.includes(key)) {
      delete base[key];
    }
  }
  return base;
}

function normalizeLabelsFlexible(input = {}) {
  if (!input || typeof input !== 'object' || !Object.keys(input).length) {
    return { ...DEFAULT_FEDERATION_LABELS };
  }
  const base = {};
  for (const [key, raw] of Object.entries(input)) {
    const k = String(key || '').trim().slice(0, 40);
    const v = String(raw || '').trim().slice(0, 40);
    if (k && v) base[k] = v;
  }
  return Object.keys(base).length ? base : { ...DEFAULT_FEDERATION_LABELS };
}

function normalizeVisibility(input = {}, labelKeys = DASHBOARD_CARD_KEYS) {
  const keys = labelKeys.length ? labelKeys : DASHBOARD_CARD_KEYS;
  const roleKeys = new Set([
    ...Object.keys(DEFAULT_VISIBILITY),
    ...Object.keys(input || {}),
  ]);
  const base = {};
  for (const role of roleKeys) {
    const defaults = DEFAULT_VISIBILITY[role] || DEFAULT_VISIBILITY.federation || {};
    const row = input[role] || {};
    const nextRow = {};
    for (const key of keys) {
      if (typeof row[key] === 'boolean') nextRow[key] = row[key];
      else if (typeof defaults[key] === 'boolean') nextRow[key] = defaults[key];
      else nextRow[key] = true;
    }
    base[role] = nextRow;
  }
  return base;
}

export function mergeFederationSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const roles = normalizeRolesList(src.roles, src.role_labels || {}, src.roles_enabled || {});
  const maps = rolesToMaps(roles);
  const labels = normalizeLabelsFlexible(src.labels || {});
  const menu_labels = normalizeDict(src.menu_labels || {}, DEFAULT_MENU_LABELS, { keepDefaults: true });
  const colors = normalizeColors(src.colors || {});
  const color_defs = normalizeColorDefs(src.color_defs, colors);
  const feature_defs = normalizeFeatureDefs(src.feature_defs, src.features || {});
  const features = normalizeFeatures(src.features || {}, feature_defs);
  return {
    colors,
    color_defs,
    labels,
    menu_labels,
    feature_defs,
    roles,
    role_labels: maps.role_labels,
    roles_enabled: maps.roles_enabled,
    features,
    card_visibility: normalizeVisibility(src.card_visibility || {}, Object.keys(labels)),
  };
}

export function getAccountVisibilityKey(user) {
  if (!user) return 'federation';
  if (user.type === 'admin') return 'admin';
  if (user.type === 'club') return 'club';
  if (user.type === 'ligue') return 'ligue';
  if (user.type === 'entente') return 'entente';
  if (user.type === 'federation' && user.fonction) {
    return `federation:${user.fonction}`;
  }
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
    next.validateTransfersEntente = false;
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

export function resolveFederationRolePermissions(fonction, settings) {
  const key = fonction === 'Responsable Affiliation' ? 'Responsable Grade' : fonction;
  if (FEDERATION_ROLES[key]) return FEDERATION_ROLES[key];
  const roles = mergeFederationSettings(settings).roles || [];
  const entry = roles.find((r) => r.key === key);
  if (entry?.base && FEDERATION_ROLES[entry.base]) return FEDERATION_ROLES[entry.base];
  return null;
}

export function getFederationRolesCatalog(settings) {
  const merged = mergeFederationSettings(settings);
  return (merged.roles || []).map((role) => ({
    key: role.key,
    label: role.label,
    enabled: role.enabled !== false,
    system: !!role.system,
    base: role.base || (role.system ? role.key : 'Membre'),
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

function buildNextSettings(current, patch = {}, { replace = false } = {}) {
  const source = replace
    ? {
        colors: patch.colors || current.colors,
        color_defs: patch.color_defs || current.color_defs,
        labels: patch.labels || current.labels,
        menu_labels: patch.menu_labels || current.menu_labels,
        feature_defs: patch.feature_defs || current.feature_defs,
        features: patch.features || current.features,
        roles: Array.isArray(patch.roles) ? patch.roles : current.roles,
        role_labels: patch.role_labels || current.role_labels,
        roles_enabled: patch.roles_enabled || current.roles_enabled,
        card_visibility: patch.card_visibility || current.card_visibility,
      }
    : {
        colors: { ...current.colors, ...(patch.colors || {}) },
        color_defs: Array.isArray(patch.color_defs) ? patch.color_defs : current.color_defs,
        labels: { ...current.labels, ...(patch.labels || {}) },
        menu_labels: { ...current.menu_labels, ...(patch.menu_labels || {}) },
        feature_defs: Array.isArray(patch.feature_defs) ? patch.feature_defs : current.feature_defs,
        features: { ...current.features, ...(patch.features || {}) },
        roles: Array.isArray(patch.roles) ? patch.roles : current.roles,
        role_labels: { ...current.role_labels, ...(patch.role_labels || {}) },
        roles_enabled: { ...current.roles_enabled, ...(patch.roles_enabled || {}) },
        card_visibility: patch.card_visibility
          ? {
              ...current.card_visibility,
              ...Object.fromEntries(
                Object.entries(patch.card_visibility).map(([role, cards]) => [
                  role,
                  { ...(current.card_visibility[role] || {}), ...cards },
                ])
              ),
            }
          : current.card_visibility,
      };

  return mergeFederationSettings(source);
}

export async function saveFederationSettings(user, patch = {}) {
  if (!user || user.type !== 'admin') {
    throw new Error('Seul le compte Admin de la fédération peut modifier le paramétrage');
  }
  const fedId = getUserFederationId(user);
  if (!fedId) throw new Error('Fédération introuvable pour ce compte Admin');
  const current = await getFederationSettingsForUser(user);
  const next = buildNextSettings(current, patch, { replace: false });
  await updateFederation(fedId, { settings: next });
  return next;
}

export async function saveFederationSettingsById(federationId, patch = {}) {
  const fed = await getFederationById(federationId);
  if (!fed) throw new Error('Fédération introuvable');
  const current = mergeFederationSettings(fed.settings);
  const next = buildNextSettings(current, patch, { replace: true });
  await updateFederation(federationId, { settings: next });
  return next;
}

export { slugifyKey, SYSTEM_COLOR_KEYS, SYSTEM_MENU_KEYS, FEDERATION_ROLE_KEYS };
