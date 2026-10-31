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

export const ACCOUNT_VISIBILITY_ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'federation', label: 'Comptes Fédération' },
  { key: 'ligue', label: 'Ligues' },
  { key: 'entente', label: 'Ententes' },
  { key: 'club', label: 'Clubs' },
];

export function mergeFederationSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    colors: { ...DEFAULT_FEDERATION_COLORS, ...(src.colors || {}) },
    labels: { ...DEFAULT_FEDERATION_LABELS, ...(src.labels || {}) },
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
