function toNumber(value) {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

export function parseWeightCategory(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const min = toNumber(raw.min);
    const max = toNumber(raw.max);
    if (min == null || max == null) return null;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return { min: lo, max: hi, label: `${lo}–${hi}`, key: `${lo}-${hi}` };
  }

  const s = String(raw || '').trim().replace(',', '.');
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–àa:]+\s*(\d+(?:\.\d+)?)$/i);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return { min: lo, max: hi, label: `${lo}–${hi}`, key: `${lo}-${hi}` };
  }
  const n = toNumber(s);
  if (n == null) return null;
  return { min: n, max: n, label: String(n), key: String(n) };
}

export function parseCategoriesPoids(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
      else list = raw.split(/[;,]/);
    } catch {
      list = raw.split(/[;,]/);
    }
  }
  const seen = new Set();
  const cats = [];
  for (const item of list) {
    const cat = parseWeightCategory(item);
    if (!cat || seen.has(cat.key)) continue;
    seen.add(cat.key);
    cats.push(cat);
  }
  return cats.sort((a, b) => a.min - b.min || a.max - b.max);
}

export function findCategoryForWeight(categories, poids) {
  const n = toNumber(poids);
  if (n == null) return null;
  return parseCategoriesPoids(categories).find((c) => n >= c.min && n <= c.max) || null;
}

export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { prenom: '', nom: '' };
  if (parts.length === 1) return { prenom: parts[0], nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

export function teamCategoryKey(row) {
  const categorie = String(row?.categorie || '').trim();
  if (categorie && !/principal|rempl/i.test(categorie)) return categorie;
  return String(row?.poids || '').trim();
}
