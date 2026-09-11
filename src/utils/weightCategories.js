function toNumber(value) {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

export function normalizeSexe(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'F' || s.startsWith('F')) return 'F';
  return 'M';
}

export function sexeLabel(sexe) {
  return normalizeSexe(sexe) === 'F' ? 'Fille' : 'Garçon';
}

function defaultLabel(min, max) {
  if (min === max) return String(max);
  return `-${max}`;
}

export function parseWeightCategory(raw, fallbackSexe = 'M') {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const min = toNumber(raw.min);
    const max = toNumber(raw.max);
    if (min == null || max == null) return null;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const sexe = normalizeSexe(raw.sexe || fallbackSexe);
    const label = String(raw.label || raw.nom || raw.categorie || '').trim() || defaultLabel(lo, hi);
    return { sexe, label, min: lo, max: hi, key: `${sexe}|${label}` };
  }

  const s = String(raw || '').trim().replace(',', '.');
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–àa:]+\s*(\d+(?:\.\d+)?)$/i);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    const sexe = normalizeSexe(fallbackSexe);
    const label = defaultLabel(lo, hi);
    return { sexe, label, min: lo, max: hi, key: `${sexe}|${label}` };
  }
  const n = toNumber(s);
  if (n == null) return null;
  const sexe = normalizeSexe(fallbackSexe);
  const label = String(raw).trim().startsWith('-') ? String(raw).trim() : `-${n}`;
  return { sexe, label, min: n, max: n, key: `${sexe}|${label}` };
}

export function parseCategoriesPoids(raw) {
  let list = [];
  let fallbackSexe = 'M';

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw.M || raw.F || raw.garcon || raw.fille)) {
    const boys = Array.isArray(raw.M) ? raw.M : (Array.isArray(raw.garcon) ? raw.garcon : []);
    const girls = Array.isArray(raw.F) ? raw.F : (Array.isArray(raw.fille) ? raw.fille : []);
    list = [
      ...boys.map((item) => ({ ...(typeof item === 'object' ? item : { label: item, min: item, max: item }), sexe: 'M' })),
      ...girls.map((item) => ({ ...(typeof item === 'object' ? item : { label: item, min: item, max: item }), sexe: 'F' })),
    ];
  } else if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseCategoriesPoids(parsed);
    } catch {
      list = raw.split(/[;,]/);
    }
  }

  const seen = new Set();
  const cats = [];
  for (const item of list) {
    const cat = parseWeightCategory(item, fallbackSexe);
    if (!cat || seen.has(cat.key)) continue;
    seen.add(cat.key);
    cats.push(cat);
  }
  return cats.sort((a, b) => {
    if (a.sexe !== b.sexe) return a.sexe === 'M' ? -1 : 1;
    return a.max - b.max || a.min - b.min || a.label.localeCompare(b.label, 'fr');
  });
}

export function categoriesForSexe(categories, sexe) {
  const wanted = normalizeSexe(sexe);
  return parseCategoriesPoids(categories).filter((c) => c.sexe === wanted);
}

export function findCategoryForWeight(categories, poids, sexe) {
  const n = toNumber(poids);
  if (n == null) return null;
  return categoriesForSexe(categories, sexe).find((c) => n >= c.min && n <= c.max) || null;
}

export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { prenom: '', nom: '' };
  if (parts.length === 1) return { prenom: parts[0], nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

export function teamCategoryKey(row) {
  const sexe = normalizeSexe(row?.sexe);
  const categorie = String(row?.categorie || '').trim();
  if (categorie && !/principal|rempl/i.test(categorie)) return `${sexe}|${categorie}`;
  return `${sexe}|${String(row?.poids || '').trim()}`;
}
