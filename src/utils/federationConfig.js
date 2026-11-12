export const DEFAULT_FEDERATION_LABELS = {
  judokas: 'Athlètes',
  clubs: 'Clubs',
  ligues: 'Ligues',
  ententes: 'Ententes',
  entraineurs: 'Entraineurs',
  arbitres: 'Arbitres',
  federation: 'Membres',
};

export const DEFAULT_FEDERATION_COLORS = {
  primary: '#1D4393',
  primary_light: '#2a5cb8',
  primary_dark: '#122d66',
  accent: '#e30613',
  bg: '#eef3fa',
};

export const COLOR_FIELD_META = {
  primary: 'Couleur principale / menus',
  primary_light: 'Principale claire',
  primary_dark: 'Principale foncée',
  accent: 'Accent',
  bg: 'Fond',
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

/** Design carte athlète - défaut = carte Judo FENACOJU actuelle. */
export const DEFAULT_CARD_DESIGN = {
  org_name: 'Fédération Nationale Congolaise de Judo',
  subtitle: 'Carte Athlète {year}',
  logo_mode: 'default',
  logo_url: '',
  qr_org: 'FENACOJU',
  show_validity: true,
  colors: {
    header_bg: '#1D4393',
    accent_start: '#1D4393',
    accent_mid: '#e30613',
    accent_end: '#f5c518',
    name: '#0d2b5e',
    label: '#1D4393',
    photo_border: '#1D4393',
  },
  fields: {
    club: true,
    grade: true,
    categorie: true,
    numero_licence: true,
  },
};

export function getDefaultCardDesign() {
  return JSON.parse(JSON.stringify(DEFAULT_CARD_DESIGN));
}

export function normalizeCardDesign(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = getDefaultCardDesign();
  const colorsIn = src.colors && typeof src.colors === 'object' ? src.colors : {};
  const fieldsIn = src.fields && typeof src.fields === 'object' ? src.fields : {};
  const logoMode = ['default', 'federation', 'custom'].includes(src.logo_mode)
    ? src.logo_mode
    : base.logo_mode;
  const hex = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '').trim()) ? v : fallback);

  return {
    org_name: String(src.org_name || base.org_name).trim().slice(0, 120) || base.org_name,
    subtitle: String(src.subtitle || base.subtitle).trim().slice(0, 80) || base.subtitle,
    logo_mode: logoMode,
    logo_url: String(src.logo_url || '').trim().slice(0, 500),
    qr_org: String(src.qr_org || base.qr_org).trim().slice(0, 40) || base.qr_org,
    show_validity: src.show_validity !== false,
    colors: {
      header_bg: hex(colorsIn.header_bg, base.colors.header_bg),
      accent_start: hex(colorsIn.accent_start, base.colors.accent_start),
      accent_mid: hex(colorsIn.accent_mid, base.colors.accent_mid),
      accent_end: hex(colorsIn.accent_end, base.colors.accent_end),
      name: hex(colorsIn.name, base.colors.name),
      label: hex(colorsIn.label, base.colors.label),
      photo_border: hex(colorsIn.photo_border, base.colors.photo_border),
    },
    fields: {
      club: fieldsIn.club !== false,
      grade: fieldsIn.grade !== false,
      categorie: fieldsIn.categorie !== false,
      numero_licence: fieldsIn.numero_licence !== false,
    },
  };
}

export const FEATURE_OPTIONS = [
  { key: 'competition', label: 'Compétition', system: true },
  { key: 'messages', label: 'Messages', system: true },
  { key: 'scan_qr', label: 'Scan QR', system: true },
  { key: 'transfers', label: 'Transferts', system: true },
  { key: 'grades', label: 'Grades / passations', system: true },
  { key: 'export', label: 'Export PDF / CSV', system: true },
  { key: 'create_accounts', label: 'Création de comptes', system: true },
];

export const ACCOUNT_VISIBILITY_ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'federation', label: 'Comptes Fédération' },
  { key: 'ligue', label: 'Ligues' },
  { key: 'entente', label: 'Ententes' },
  { key: 'club', label: 'Clubs' },
];

export const DEFAULT_FEDERATION_ROLE_KEYS = [
  'Coordon',
  'Coordon Adjoint',
  'Secrétaire Général',
  'Directeur Technique',
  'Directeur Compétition',
  'Responsable Grade',
  'Membre',
  'Assistant (e)',
];

export const ROLE_BASE_OPTIONS = [...DEFAULT_FEDERATION_ROLE_KEYS];

export function slugifyKey(value, fallback = 'item') {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return raw || fallback;
}

function defaultRoles() {
  return DEFAULT_FEDERATION_ROLE_KEYS.map((key, order) => ({
    key,
    label: key,
    enabled: true,
    system: true,
    base: key,
    order,
  }));
}

function normalizeRoles(src = {}) {
  if (Array.isArray(src.roles) && src.roles.length) {
    const seen = new Set();
    return src.roles
      .map((item, idx) => {
        const key = String(item?.key || item?.label || '').trim().slice(0, 60);
        if (!key || seen.has(key)) return null;
        seen.add(key);
        const system = DEFAULT_FEDERATION_ROLE_KEYS.includes(key) || item?.system === true;
        const base = ROLE_BASE_OPTIONS.includes(item?.base)
          ? item.base
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

  const labels = src.role_labels || {};
  const enabled = src.roles_enabled || {};
  return defaultRoles().map((role) => ({
    ...role,
    label: labels[role.key] || role.key,
    enabled: enabled[role.key] !== false,
  }));
}

export function mergeFederationSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const roles = normalizeRoles(src);
  const role_labels = Object.fromEntries(roles.map((r) => [r.key, r.label]));
  const roles_enabled = Object.fromEntries(roles.map((r) => [r.key, r.enabled !== false]));

  const labels = (src.labels && typeof src.labels === 'object' && Object.keys(src.labels).length)
    ? { ...src.labels }
    : { ...DEFAULT_FEDERATION_LABELS };
  const menu_labels = { ...DEFAULT_MENU_LABELS, ...(src.menu_labels || {}) };
  if (!menu_labels.settings || menu_labels.settings === 'Réglages') {
    menu_labels.settings = 'Réglages Profil';
  }
  const colors = { ...DEFAULT_FEDERATION_COLORS, ...(src.colors || {}) };

  let feature_defs = Array.isArray(src.feature_defs) && src.feature_defs.length
    ? src.feature_defs.map((f, order) => ({
        key: slugifyKey(f.key || f.label, `feature_${order}`),
        label: String(f.label || f.key || '').trim().slice(0, 60) || f.key,
        system: FEATURE_OPTIONS.some((o) => o.key === f.key) || f.system === true,
        order: typeof f.order === 'number' ? f.order : order,
      }))
    : FEATURE_OPTIONS.map((f, order) => ({ ...f, order }));

  const featureKeys = new Set(feature_defs.map((f) => f.key));
  for (const key of Object.keys(src.features || {})) {
    if (!featureKeys.has(key)) {
      feature_defs.push({ key, label: key, system: false, order: feature_defs.length });
      featureKeys.add(key);
    }
  }

  const features = { ...DEFAULT_FEATURES };
  for (const def of feature_defs) {
    if (typeof src.features?.[def.key] === 'boolean') features[def.key] = src.features[def.key];
    else if (!(def.key in features)) features[def.key] = true;
  }

  let color_defs = Array.isArray(src.color_defs) && src.color_defs.length
    ? src.color_defs
      .filter((c) => colors[c.key])
      .map((c, order) => ({
        key: c.key,
        label: c.label || COLOR_FIELD_META[c.key] || c.key,
        system: Object.prototype.hasOwnProperty.call(DEFAULT_FEDERATION_COLORS, c.key) || c.system === true,
        order: typeof c.order === 'number' ? c.order : order,
      }))
    : Object.keys(colors).map((key, order) => ({
        key,
        label: COLOR_FIELD_META[key] || key,
        system: Object.prototype.hasOwnProperty.call(DEFAULT_FEDERATION_COLORS, key),
        order,
      }));

  for (const key of Object.keys(colors)) {
    if (!color_defs.some((c) => c.key === key)) {
      color_defs.push({
        key,
        label: COLOR_FIELD_META[key] || key,
        system: Object.prototype.hasOwnProperty.call(DEFAULT_FEDERATION_COLORS, key),
        order: color_defs.length,
      });
    }
  }

  return {
    colors,
    color_defs,
    labels,
    menu_labels,
    feature_defs,
    roles,
    role_labels,
    roles_enabled,
    features,
    card_visibility: src.card_visibility || {},
    card_design: normalizeCardDesign(src.card_design || {}),
  };
}

export function getRolesCatalog(settings) {
  const merged = mergeFederationSettings(settings);
  return merged.roles || [];
}

export function getVisibilityRole(user) {
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

export function isCardVisible(settings, user, cardKey) {
  const role = getVisibilityRole(user);
  const specific = settings?.card_visibility?.[role];
  const fallback = role.startsWith('federation:')
    ? settings?.card_visibility?.federation
    : null;
  const row = specific || fallback;
  if (!row || row[cardKey] === undefined) return true;
  return row[cardKey] !== false;
}

export function entityLabel(settings, key, fallback) {
  return settings?.labels?.[key] || fallback || DEFAULT_FEDERATION_LABELS[key] || key;
}

export function menuLabel(settings, key, fallback) {
  return settings?.menu_labels?.[key] || fallback || DEFAULT_MENU_LABELS[key] || key;
}

export function applyFederationTheme(colors) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const c = { ...DEFAULT_FEDERATION_COLORS, ...(colors || {}) };
  root.style.setProperty('--primary', c.primary);
  root.style.setProperty('--primary-light', c.primary_light);
  root.style.setProperty('--primary-dark', c.primary_dark);
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--bg', c.bg);
}

export function clearFederationTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  ['--primary', '--primary-light', '--primary-dark', '--accent', '--bg'].forEach((k) => {
    root.style.removeProperty(k);
  });
}
