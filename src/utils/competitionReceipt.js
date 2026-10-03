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
  const orderNumber = extractOrderNumber(paiement)
    || extractOrderNumber(regs[0]?.mode_paiement);
  const payMontant = Number(paiement?.montant);
  const totalFromRegs = regs.reduce((sum, r) => sum + (Number(r.montant_paye) || 0), 0);
  let montant = Number.isFinite(payMontant) ? payMontant : 0;
  if (!Number.isFinite(payMontant) || payMontant < 0) {
    montant = mode === 'equipe'
      ? (Number(regs[0]?.montant_paye) || 0)
      : totalFromRegs;
  }
  const monnaie = String(paiement?.monnaie || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const telephone = String(paiement?.telephone || '').trim();
  const registrationIds = regs.map((r) => r.id).filter(Boolean);
  const list = (participants || regs).map((p) => ({
    nom: String(p.nom || '').trim(),
    prenom: String(p.prenom || '').trim(),
    club: String(p.club || club || '').trim(),
    categorie: String(p.categorie || '').trim(),
    role: String(p.role_equipe || p.role || '').trim(),
    sexe: p.sexe === 'F' ? 'F' : (p.sexe === 'M' ? 'M' : ''),
  }));

  const base = {
    v: 1,
    t: RECEIPT_QR_TYPE,
    competitionToken: String(competition?.public_token || competition?.token || '').trim(),
    competitionNom: String(competition?.nom || 'Compétition').trim(),
    mode: mode === 'equipe' ? 'equipe' : 'individuel',
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
