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

export function getCategoryAgeRule(categorie) {
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
 * Détermine la catégorie d’âge à partir de la date de naissance.
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

/**
 * @returns {string|null} message d’erreur, ou null si OK / pas de règle
 */
export function validateCategoryAge(categorie, dateNaissance) {
  const rule = getCategoryAgeRule(categorie);
  if (!rule) return null;
  if (!dateNaissance) {
    return `La date de naissance est obligatoire pour la catégorie ${rule.label}`;
  }
  const age = calcAgeFromDate(dateNaissance);
  if (!Number.isFinite(age) || age < 0) return 'Date de naissance invalide';
  if (age < rule.min || age > rule.max) {
    return `La catégorie ${rule.label} accepte uniquement les judokas de ${rule.min} à ${rule.max} ans (âge actuel : ${age} ans)`;
  }
  return null;
}
