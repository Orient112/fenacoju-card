import { getDefaultCardDesign, normalizeCardDesign } from './federationConfig';

/** Préfixe ID carte dérivé du nom de profil / slug de la fédération. */
export function deriveCardIdPrefix(federation) {
  const source = String(
    federation?.nom_profil || federation?.slug || federation?.nom || 'FED'
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  if (!source) return 'FED';
  // Judo / FENACOJU → FCJ (compat historique)
  if (/FENACOJU|JUDO/.test(source)) return 'FCJ';
  return source.slice(0, 3) || 'FED';
}

export function buildPreviewCardNumber(prefix, year = new Date().getFullYear()) {
  const safe = String(prefix || 'FCJ').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'FCJ';
  return `${safe}-${year}-0001`;
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function averageRegion(data, width, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const step = 4;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }
  if (!count) return '#1D4393';
  return rgbToHex(r / count, g / count, b / count);
}

function darkestInRegion(data, width, x0, y0, x1, y1) {
  let best = null;
  let bestLum = Infinity;
  const step = 3;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < bestLum && lum < 180) {
        bestLum = lum;
        best = rgbToHex(r, g, b);
      }
    }
  }
  return best || '#0d2b5e';
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire l\'image JPG'));
    };
    img.src = url;
  });
}

/**
 * Analyse un JPG de carte : extrait couleurs (en-tête, accents, textes)
 * et propose des intitulés à partir du profil fédération.
 */
export async function extractDesignFromJpg(file, { federation = null, current = null } = {}) {
  if (!file || !/\.jpe?g$/i.test(file.name || '') && !/^image\/jpeg$/i.test(file.type || '')) {
    throw new Error('Importez un fichier .JPG');
  }
  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const w = Math.min(640, img.naturalWidth || img.width);
  const h = Math.round(((img.naturalHeight || img.height) / (img.naturalWidth || img.width)) * w);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const header = averageRegion(data, w, 0, 0, w, Math.max(4, Math.floor(h * 0.18)));
  const accentStart = averageRegion(data, w, 0, 0, Math.floor(w * 0.25), Math.max(2, Math.floor(h * 0.04)));
  const accentMid = averageRegion(data, w, Math.floor(w * 0.35), 0, Math.floor(w * 0.65), Math.max(2, Math.floor(h * 0.04)));
  const accentEnd = averageRegion(data, w, Math.floor(w * 0.75), 0, w, Math.max(2, Math.floor(h * 0.04)));
  const name = darkestInRegion(data, w, Math.floor(w * 0.28), Math.floor(h * 0.28), Math.floor(w * 0.72), Math.floor(h * 0.55));
  const label = averageRegion(data, w, Math.floor(w * 0.28), Math.floor(h * 0.55), Math.floor(w * 0.55), Math.floor(h * 0.72));
  const photoBorder = header;

  const profil = federation?.nom_profil || federation?.nom || '';
  const prefix = deriveCardIdPrefix(federation);
  const base = normalizeCardDesign(current || getDefaultCardDesign());

  return normalizeCardDesign({
    ...base,
    org_name: profil
      ? (profil.toLowerCase().includes('fédération') ? profil : `Fédération ${profil}`)
      : base.org_name,
    subtitle: base.subtitle || 'Carte Athlète {year}',
    card_id_prefix: prefix,
    logo_mode: federation?.logo_url ? 'federation' : base.logo_mode,
    colors: {
      header_bg: header,
      accent_start: accentStart,
      accent_mid: accentMid,
      accent_end: accentEnd,
      name,
      label,
      photo_border: photoBorder,
    },
  });
}

const GENERATED_PALETTES = [
  { header_bg: '#0f4c81', accent_start: '#0f4c81', accent_mid: '#c8102e', accent_end: '#f4b400', name: '#0b2a4a', label: '#0f4c81', photo_border: '#0f4c81' },
  { header_bg: '#123a2a', accent_start: '#123a2a', accent_mid: '#c45c26', accent_end: '#e8b86d', name: '#0d241c', label: '#1a5c45', photo_border: '#123a2a' },
  { header_bg: '#2b2156', accent_start: '#2b2156', accent_mid: '#d64045', accent_end: '#f7c948', name: '#1a1438', label: '#3d2f7a', photo_border: '#2b2156' },
  { header_bg: '#1b3a4b', accent_start: '#1b3a4b', accent_mid: '#ef8354', accent_end: '#f9c74f', name: '#102833', label: '#245771', photo_border: '#1b3a4b' },
  { header_bg: '#3d0c11', accent_start: '#3d0c11', accent_mid: '#8b1e3f', accent_end: '#d4a373', name: '#2a080c', label: '#6b152f', photo_border: '#3d0c11' },
  { header_bg: '#0b3d2e', accent_start: '#0b3d2e', accent_mid: '#e36414', accent_end: '#f4d35e', name: '#06281e', label: '#0f5c45', photo_border: '#0b3d2e' },
  { header_bg: '#1D4393', accent_start: '#1D4393', accent_mid: '#e30613', accent_end: '#f5c518', name: '#0d2b5e', label: '#1D4393', photo_border: '#1D4393' },
];

const SUBTITLE_VARIANTS = [
  'Carte Athlète {year}',
  'Licence Athlète {year}',
  'Carte Officielle {year}',
  'Identité Athlète {year}',
];

/** Génère un nouveau modèle de carte pour la fédération choisie. */
export function generateCardDesignForFederation(federation, current = null, seed = Date.now()) {
  const base = normalizeCardDesign(current || getDefaultCardDesign());
  const palette = GENERATED_PALETTES[Math.abs(seed) % GENERATED_PALETTES.length];
  const subtitle = SUBTITLE_VARIANTS[Math.abs(seed >> 3) % SUBTITLE_VARIANTS.length];
  const profil = federation?.nom_profil || federation?.nom || base.org_name;
  const prefix = base.card_id_prefix || deriveCardIdPrefix(federation);

  return normalizeCardDesign({
    ...base,
    org_name: profil
      ? (String(profil).toLowerCase().includes('fédération') || String(profil).toLowerCase().includes('federation')
        ? profil
        : `Fédération ${profil}`)
      : base.org_name,
    subtitle,
    card_id_prefix: prefix,
    logo_mode: federation?.logo_url ? 'federation' : (base.logo_mode || 'default'),
    colors: { ...palette },
    fields: {
      club: true,
      grade: true,
      categorie: true,
      numero_licence: Math.abs(seed) % 2 === 0,
    },
    show_validity: true,
  });
}
