export const RECEIPT_QR_TYPE = 'FENACOJU_RECEIPT';

function simpleChecksum(parts) {
  const str = parts.map((p) => String(p ?? '')).join('|');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function extractOrderNumber(modePaiementOrPaiement) {
  if (!modePaiementOrPaiement) return '';
  if (typeof modePaiementOrPaiement === 'object') {
    return String(
      modePaiementOrPaiement.orderNumber
      || modePaiementOrPaiement.order_number
      || ''
    ).trim();
  }
  const raw = String(modePaiementOrPaiement).trim();
  const parts = raw.split('|');
  if (parts.length >= 3 && parts[0] === 'mobile_money') {
    return parts[parts.length - 1].trim();
  }
  return '';
}

/** Référence affichée sans le numéro de téléphone du payeur (souvent collé en suffixe SimplyPaye). */
export function displayReceiptReference(orderNumber, telephone = '') {
  let ref = String(orderNumber || '').trim();
  if (!ref) return '—';

  const digitsPhone = String(telephone || '').replace(/\D/g, '');
  const candidates = new Set();
  if (digitsPhone) {
    candidates.add(digitsPhone);
    if (digitsPhone.startsWith('243') && digitsPhone.length > 9) {
      candidates.add(digitsPhone.slice(3));
    }
    if (digitsPhone.startsWith('0') && digitsPhone.length >= 10) {
      candidates.add(`243${digitsPhone.slice(1)}`);
      candidates.add(digitsPhone.slice(1));
    }
    if (!digitsPhone.startsWith('243') && digitsPhone.length >= 9) {
      candidates.add(`243${digitsPhone}`);
    }
  }

  for (const phone of candidates) {
    if (phone.length >= 9 && ref.endsWith(phone)) {
      ref = ref.slice(0, -phone.length);
      break;
    }
  }

  // Sécurité : retirer un suffixe purement numérique type MSISDN (9–15 chiffres)
  ref = ref.replace(/(\D)(\d{9,15})$/, '$1').replace(/\d{9,15}$/, '');
  ref = ref.replace(/[-_\s.]+$/g, '').trim();
  return ref || String(orderNumber || '').trim();
}

export function buildReceiptPayload({
  competition,
  mode,
  paiement,
  participants,
  registrations,
  club,
  sexe,
}) {
  const regs = registrations || [];
  const receiptMode = mode === 'equipe' ? 'equipe' : 'individuel';
  const orderNumber = extractOrderNumber(paiement)
    || extractOrderNumber(regs[0]?.mode_paiement);
  const list = (participants || regs).map((p) => ({
    nom: String(p.nom || '').trim(),
    prenom: String(p.prenom || '').trim(),
    club: String(p.club || club || '').trim(),
    categorie: String(p.categorie || '').trim(),
    role: String(p.role_equipe || p.role || '').trim(),
    sexe: p.sexe === 'F' ? 'F' : (p.sexe === 'M' ? 'M' : ''),
  }));
  const judokaCount = receiptMode === 'equipe'
    ? 1
    : Math.max(1, list.length || regs.length || 1);

  // Priorité : frais CDF des paramètres → montant paiement → montant_paye stocké
  const feeCdf = getCompetitionFeeCdf(competition, receiptMode, judokaCount);
  const payMontant = Number(paiement?.montant);
  const totalFromRegs = regs.reduce((sum, r) => sum + (Number(r.montant_paye) || 0), 0);
  let montant = feeCdf;
  if (!(montant > 0) && Number.isFinite(payMontant) && payMontant > 0) {
    montant = payMontant;
  }
  if (!(montant > 0)) {
    montant = receiptMode === 'equipe'
      ? (Number(regs[0]?.montant_paye) || 0)
      : totalFromRegs;
  }
  const monnaie = feeCdf > 0
    ? 'CDF'
    : (String(paiement?.monnaie || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF');
  const telephone = String(paiement?.telephone || '').trim();
  const registrationIds = regs.map((r) => r.id).filter(Boolean);

  const base = {
    v: 1,
    t: RECEIPT_QR_TYPE,
    competitionToken: String(competition?.public_token || competition?.token || '').trim(),
    competitionNom: String(competition?.nom || 'Compétition').trim(),
    mode: receiptMode,
    orderNumber,
    montant,
    monnaie,
    telephone,
    club: String(club || list[0]?.club || '').trim(),
    sexe: sexe === 'F' ? 'F' : (sexe === 'M' ? 'M' : ''),
    date: new Date().toISOString(),
    participants: list,
    registrationIds,
  };

  base.c = simpleChecksum([
    base.competitionToken,
    base.mode,
    base.orderNumber,
    base.montant,
    base.monnaie,
    base.telephone,
    base.club,
    ...base.registrationIds,
    ...base.participants.map((p) => `${p.prenom}|${p.nom}|${p.categorie}|${p.role}`),
  ]);

  return base;
}

export function encodeReceiptQr(payload) {
  return JSON.stringify(payload);
}

export function parseReceiptQr(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (!data || data.t !== RECEIPT_QR_TYPE) return null;
    return data;
  } catch {
    return null;
  }
}

export function isReceiptChecksumValid(payload) {
  if (!payload || !payload.c) return false;
  const expected = simpleChecksum([
    payload.competitionToken,
    payload.mode,
    payload.orderNumber,
    payload.montant,
    payload.monnaie,
    payload.telephone,
    payload.club,
    ...(payload.registrationIds || []),
    ...(payload.participants || []).map((p) => `${p.prenom || ''}|${p.nom || ''}|${p.categorie || ''}|${p.role || ''}`),
  ]);
  return expected === payload.c;
}

/**
 * Vérifie l'authenticité du reçu face aux inscriptions de la compétition ouverte.
 */
export function verifyReceiptAuthenticity(payload, {
  competition,
  registrations = [],
} = {}) {
  if (!payload || payload.t !== RECEIPT_QR_TYPE) {
    return {
      authentic: false,
      status: 'invalid',
      message: 'QR Code non reconnu comme reçu FENACOJU.',
    };
  }

  if (!isReceiptChecksumValid(payload)) {
    return {
      authentic: false,
      status: 'tampered',
      message: 'Reçu altéré : le contrôle d’intégrité a échoué.',
      payload,
    };
  }

  const token = String(competition?.public_token || '').trim();
  if (token && payload.competitionToken && payload.competitionToken !== token) {
    return {
      authentic: false,
      status: 'wrong_competition',
      message: 'Ce reçu appartient à une autre compétition.',
      payload,
    };
  }

  const orderNumber = String(payload.orderNumber || '').trim();
  const ids = new Set((payload.registrationIds || []).map(String));

  const matches = (registrations || []).filter((r) => {
    if (ids.size && ids.has(String(r.id))) return true;
    if (orderNumber) {
      const stored = extractOrderNumber(r.mode_paiement);
      if (stored && stored === orderNumber) return true;
      if (String(r.mode_paiement || '').includes(orderNumber)) return true;
    }
    return false;
  });

  if (!matches.length) {
    return {
      authentic: false,
      status: 'not_found',
      message: 'Aucune inscription correspondante trouvée pour ce reçu.',
      payload,
    };
  }

  const dbHasPaymentMeta = matches.some((r) => (
    String(r.paiement_statut || '') === 'paye'
    || Number(r.montant_paye) > 0
    || Boolean(extractOrderNumber(r.mode_paiement))
    || String(r.mode_paiement || '').includes('mobile_money')
  ));

  // Les colonnes paiement peuvent être absentes en base (fallback insert) :
  // si l'inscription liée existe + reçu intègre avec référence paiement → authentique.
  const receiptProvesPayment = Boolean(orderNumber) || Number(payload.montant) > 0;
  const identityAligned = (() => {
    const people = payload.participants || [];
    if (!people.length) return true;
    return people.some((p) => matches.some((r) => {
      const sameNom = String(r.nom || '').trim().toLowerCase() === String(p.nom || '').trim().toLowerCase();
      const samePrenom = String(r.prenom || '').trim().toLowerCase() === String(p.prenom || '').trim().toLowerCase();
      return sameNom && samePrenom;
    }));
  })();

  if (!dbHasPaymentMeta && !(receiptProvesPayment && identityAligned)) {
    return {
      authentic: false,
      status: 'unpaid',
      message: 'Inscriptions trouvées mais paiement non confirmé en base.',
      payload,
      matches,
    };
  }

  const expectedAmount = Number(payload.montant) || 0;
  const sum = matches.reduce((s, r) => s + (Number(r.montant_paye) || 0), 0);
  const dbAmountsPresent = matches.some((r) => Number(r.montant_paye) > 0);

  if (dbAmountsPresent && expectedAmount > 0) {
    if (payload.mode === 'individuel' && Math.abs(sum - expectedAmount) > 0.01) {
      return {
        authentic: false,
        status: 'amount_mismatch',
        message: `Montant incohérent (reçu ${expectedAmount}, inscrits ${sum}).`,
        payload,
        matches,
      };
    }
    if (payload.mode === 'equipe') {
      const teamAmount = Number(matches[0]?.montant_paye) || 0;
      if (Math.abs(teamAmount - expectedAmount) > 0.01) {
        return {
          authentic: false,
          status: 'amount_mismatch',
          message: `Montant incohérent (reçu ${expectedAmount}, équipe ${teamAmount}).`,
          payload,
          matches,
        };
      }
    }
  }

  return {
    authentic: true,
    status: 'ok',
    message: 'Reçu authentique : paiement et inscription confirmés.',
    payload,
    matches,
  };
}

export function formatReceiptAmount(montant, monnaie) {
  const n = Math.max(0, Number(montant) || 0);
  const cur = String(monnaie || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const suffix = cur === 'USD' ? 'USD' : 'CDF';
  const formatted = n.toLocaleString('fr-FR', {
    maximumFractionDigits: cur === 'USD' ? 2 : 0,
  }).replace(/\//g, '').replace(/\u202f/g, ' ').trim();
  return `${formatted} ${suffix}`;
}

/** Parse un montant issu du formulaire / API (string ou number). */
export function parseFeeNumber(raw) {
  if (raw == null || raw === '') return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const cleaned = String(raw)
    .trim()
    .replace(/\s/g, '')
    .replace(/\u202f/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Frais de participation en Franc Congolais (Paramètres de Compétition).
 * Individuel : prix par judoka × nombre d’inscrits sur le reçu.
 * Par équipe : prix par club (une fois).
 * Ignore les 0 pour laisser la première valeur positive parmi les clés.
 */
export function getCompetitionFeeCdf(competition, mode, judokaCount = 1) {
  const isTeam = mode === 'equipe';
  const pickPositive = (...keys) => {
    let fallback = 0;
    for (const key of keys) {
      const n = parseFeeNumber(competition?.[key]);
      if (!Number.isFinite(n) || n < 0) continue;
      if (n > 0) return n;
      fallback = 0;
    }
    return fallback;
  };
  if (isTeam) {
    return pickPositive('frais_equipe_cdf', 'frais_equipe');
  }
  const unit = pickPositive('frais_individuel_cdf', 'frais_individuel');
  const count = Math.max(1, Number(judokaCount) || 1);
  return unit * count;
}

/** Fusionne plusieurs sources (settings, form, API) et garde le meilleur frais CDF. */
export function resolveCompetitionFeesCdf(...sources) {
  const merged = {};
  const keys = [
    'frais_individuel_cdf',
    'frais_individuel',
    'frais_equipe_cdf',
    'frais_equipe',
    'frais_individuel_usd',
    'frais_equipe_usd',
    'frais_monnaie',
  ];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      if (src[key] == null || src[key] === '') continue;
      if (key === 'frais_monnaie') {
        merged[key] = src[key];
        continue;
      }
      const n = parseFeeNumber(src[key]);
      if (!Number.isFinite(n) || n < 0) continue;
      const prev = merged[key];
      // Garder le montant le plus élevé (> 0 prioritaire sur 0)
      if (prev == null || n > prev) merged[key] = n;
    }
  }
  return merged;
}

export function getReceiptDisplayReference(payload) {
  if (!payload) return '—';
  return displayReceiptReference(payload.orderNumber, payload.telephone);
}

/** Reconstruit un payload de reçu à partir des inscriptions stockées. */
export function buildReceiptPayloadFromRegistrations({
  competition,
  mode,
  registrations = [],
  club = '',
} = {}) {
  const regs = Array.isArray(registrations) ? registrations.filter(Boolean) : [];
  const primary = regs[0] || {};
  const parts = String(primary.mode_paiement || '').split('|');
  const telephone = (parts[0] === 'mobile_money' && parts[1])
    ? parts[1].trim()
    : String(primary.telephone || '').trim();
  const orderNumber = extractOrderNumber(primary.mode_paiement);
  const isTeam = mode === 'equipe';
  // Montant = frais CDF des paramètres (Individuel / Par équipe), pas le montant_paye stocké
  const montant = getCompetitionFeeCdf(
    competition,
    isTeam ? 'equipe' : 'individuel',
    isTeam ? 1 : Math.max(1, regs.length),
  );

  const payload = buildReceiptPayload({
    competition,
    mode: isTeam ? 'equipe' : 'individuel',
    paiement: {
      orderNumber,
      telephone,
      montant,
      monnaie: 'CDF',
    },
    participants: regs,
    registrations: regs,
    club: club || primary.club || '',
    sexe: primary.sexe,
  });

  if (primary.created_at) {
    payload.date = primary.created_at;
  }

  return payload;
}
