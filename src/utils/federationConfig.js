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

export const FEATURE_OPTIONS = [
  { key: 'competition', label: 'Compétition' },
  { key: 'messages', label: 'Messages' },
  { key: 'scan_qr', label: 'Scan QR' },
  { key: 'transfers', label: 'Transferts' },
  { key: 'grades', label: 'Grades / passations' },
  { key: 'export', label: 'Export PDF / CSV' },
  { key: 'create_accounts', label: 'Création de comptes' },
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

export function mergeFederationSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const roleLabels = Object.fromEntries(
    DEFAULT_FEDERATION_ROLE_KEYS.map((k) => [k, k])
  );
  const rolesEnabled = Object.fromEntries(
    DEFAULT_FEDERATION_ROLE_KEYS.map((k) => [k, true])
  );
  return {
    colors: { ...DEFAULT_FEDERATION_COLORS, ...(src.colors || {}) },
    labels: { ...DEFAULT_FEDERATION_LABELS, ...(src.labels || {}) },
    menu_labels: { ...DEFAULT_MENU_LABELS, ...(src.menu_labels || {}) },
    role_labels: { ...roleLabels, ...(src.role_labels || {}) },
    roles_enabled: { ...rolesEnabled, ...(src.roles_enabled || {}) },
    features: { ...DEFAULT_FEATURES, ...(src.features || {}) },
    card_visibility: src.card_visibility || {},
  };
}

export function getVisibilityRole(user) {
  if (!user) return 'federation';
  if (user.type === 'admin') return 'admin';
  if (user.type === 'club') return 'club';
  if (user.type === 'ligue') return 'ligue';
  if (user.type === 'entente') return 'entente';
  return 'federation';
}

export function isCardVisible(settings, user, cardKey) {
  const role = getVisibilityRole(user);
  const row = settings?.card_visibility?.[role];
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
