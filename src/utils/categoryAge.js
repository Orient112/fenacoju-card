/** Règles d’âge pour les catégories d’âge (enregistrement / inscription Individuel). */

export function calcAgeFromDate(dateNaissance, refDate = new Date()) {
  if (!dateNaissance) return NaN;
  const birth = new Date(dateNaissance);
  if (Number.isNaN(birth.getTime())) return NaN;
  const today = refDate instanceof Date ? refDate : new Date(refDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export const CATEGORY_AGE_RANGES = {
  juniors: { min: 17, max: 21, label: 'Juniors' },
  seniors: { min: 22, max: 99, label: 'Seniors' },
};

export function parseCategoriesAge(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseCategoriesAge(parsed);
    } catch {
      return [];
    }
  }

  const seen = new Set();
  const cats = [];
  for (const item of list) {
    const label = String(item?.label || item?.nom || item?.categorie || '').trim();
    const min = Number(item?.min);
    const max = Number(item?.max);
    if (!label || !Number.isFinite(min) || !Number.isFinite(max)) continue;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cats.push({
      id: String(item?.id || `${key}-${lo}-${hi}`),
      label,
      min: lo,
      max: hi,
    });
  }
  return cats.sort((a, b) => a.min - b.min || a.max - b.max || a.label.localeCompare(b.label, 'fr'));
}

export function getCategoryAgeRule(categorie, thresholds = null) {
  const parsed = parseCategoriesAge(thresholds);
  if (parsed.length) {
    const key = String(categorie || '').trim().toLowerCase();
    return parsed.find((t) => t.label.toLowerCase() === key) || null;
  }
  const key = String(categorie || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key.startsWith('junior')) return CATEGORY_AGE_RANGES.juniors;
  if (key.startsWith('senior')) return CATEGORY_AGE_RANGES.seniors;
  return null;
}

/**
 * Détermine la catégorie d’âge à partir de la date de naissance (règles globales).
 * @returns {'Juniors'|'Seniors'|''}
 */
export function categoryFromBirthDate(dateNaissance, refDate = new Date()) {
  const age = calcAgeFromDate(dateNaissance, refDate);
  if (!Number.isFinite(age) || age < 0) return '';
  if (age >= CATEGORY_AGE_RANGES.juniors.min && age <= CATEGORY_AGE_RANGES.juniors.max) {
    return CATEGORY_AGE_RANGES.juniors.label;
  }
  if (age >= CATEGORY_AGE_RANGES.seniors.min && age <= CATEGORY_AGE_RANGES.seniors.max) {
    return CATEGORY_AGE_RANGES.seniors.label;
  }
  return '';
}

/** Catégorie d’âge selon les seuils paramétrés d’une compétition. */
export function categoryFromAgeThresholds(dateNaissance, thresholds, refDate = new Date()) {
  const parsed = parseCategoriesAge(thresholds);
  if (!parsed.length) return categoryFromBirthDate(dateNaissance, refDate);
  const age = calcAgeFromDate(dateNaissance, refDate);
  if (!Number.isFinite(age) || age < 0) return '';
  const match = parsed.find((t) => age >= t.min && age <= t.max);
  return match ? match.label : '';
}

/**
 * @returns {string|null} message d’erreur, ou null si OK / pas de règle
 */
export function validateCategoryAge(categorie, dateNaissance, thresholds = null) {
  const rule = getCategoryAgeRule(categorie, thresholds);
  if (!rule) return null;
  if (!dateNaissance) {
    return `La date de naissance est obligatoire pour la catégorie ${rule.label}`;
  }
  const age = calcAgeFromDate(dateNaissance);
  if (!Number.isFinite(age) || age < 0) return 'Date de naissance invalide';
  if (age < rule.min || age > rule.max) {
    return `La catégorie ${rule.label} accepte uniquement les athlètes de ${rule.min} à ${rule.max} ans (âge actuel : ${age} ans)`;
  }
  return null;
}

export function validateCategoryAgeThresholds(categorie, dateNaissance, thresholds) {
  return validateCategoryAge(categorie, dateNaissance, thresholds);
}
