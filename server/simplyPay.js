/**
 * SimplyPaye — paiement Mobile Money (production)
 * Aligné sur @simplypaye/sdk : header X-API-Key uniquement, pas de Bearer ni apiKey dans le body.
 * Docs: POST /api/simply-production + GET /api/checkstatus-ordernumber/{orderNumber}
 * Succès uniquement si checkstatus.code === "1"
 */

const SIMPLY_PAY_BASE = 'https://api-simply-pay.net/api';
const INIT_URL = `${SIMPLY_PAY_BASE}/simply-production`;

/** Short code marchand FENACOJU (surchagéable via SIMPLY_PAY_MERCHANT_CODE) */
const DEFAULT_MERCHANT_CODE = '30255508';
/** Clé API marchand (surchagéable via SIMPLY_PAY_API_KEY) — header X-API-Key obligatoire */
const DEFAULT_API_KEY = 'sp_QjT7rCTdXmIGnoS6dYRJIGpMBpykK6E5gNQRSPuT7WAMGEHP';

function getConfig() {
  const merchantCode = String(
    process.env.SIMPLY_PAY_MERCHANT_CODE
    || process.env.SIMPLY_PAY_SHORT_CODE
    || DEFAULT_MERCHANT_CODE
  ).trim();
  const apiKey = String(
    process.env.SIMPLY_PAY_API_KEY
    || DEFAULT_API_KEY
  ).trim();
  return { merchantCode, apiKey };
}

export function isSimplyPayConfigured() {
  const { merchantCode, apiKey } = getConfig();
  return Boolean(merchantCode && apiKey);
}

/** Normalise un numéro RDC vers le format international 243… */
export function normalizeCongoPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = `243${digits.slice(1)}`;
  } else if (!digits.startsWith('243') && digits.length === 9) {
    digits = `243${digits}`;
  }
  return digits;
}

function buildHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Clé API marchand requise (header X-API-Key).');
  }
  // SDK officiel : uniquement X-API-Key (pas de Bearer)
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-Key': key,
  };
}

/**
 * Initie un paiement Mobile Money (push PIN).
 * @returns {{ orderNumber, reference, raw }}
 */
export async function initiateSimplyPayPayment({
  phone,
  amount,
  currency = 'CDF',
  reference = '',
} = {}) {
  const { merchantCode, apiKey } = getConfig();
  if (!merchantCode) {
    throw new Error('Paiement non configuré (SIMPLY_PAY_MERCHANT_CODE manquant)');
  }
  if (!apiKey) {
    throw new Error('Clé API marchand requise (header X-API-Key).');
  }

  const normalizedPhone = normalizeCongoPhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 12) {
    throw new Error('Numéro mobile invalide. Utilisez le format 0990… ou 243…');
  }

  const montant = Math.max(0, Number(amount) || 0);
  if (montant <= 0) {
    throw new Error('Montant de paiement invalide');
  }

  const devise = String(currency || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const body = {
    merchantCode,
    phone: normalizedPhone,
    amount: String(Math.round(montant * 100) / 100),
    currency: devise,
  };
  if (reference) body.reference = String(reference).slice(0, 64);

  const res = await fetch(INIT_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Réponse SimplyPaye invalide lors de l\'initiation');
  }

  if (!res.ok) {
    const msg = data.message || data.error || `Échec d'initiation du paiement (${res.status})`;
    if (res.status === 401 && /invalide/i.test(String(msg))) {
      throw new Error(
        `${msg}. Sur SimplyPaye, cette clé n'est pas liée au code marchand ${merchantCode}. `
        + 'Connectez-vous au portail marchand de ce code, régénérez la clé API, puis mettez à jour SIMPLY_PAY_API_KEY.'
      );
    }
    throw new Error(msg);
  }

  const orderNumber = data?.simply_pay?.orderNumber
    || data?.transaction?.orderNumberFlex
    || data?.orderNumber
    || '';
  const simplyCode = String(data?.simply_pay?.code ?? '');

  if (!orderNumber) {
    throw new Error(
      data?.simply_pay?.message
      || data?.message
      || 'Impossible d\'obtenir le numéro de transaction SimplyPaye'
    );
  }

  // code "0" = push envoyé avec succès (pas encore payé)
  if (simplyCode && simplyCode !== '0' && simplyCode !== '1') {
    throw new Error(
      data?.simply_pay?.message
      || data?.message
      || 'Le push de paiement n\'a pas pu être envoyé'
    );
  }

  return {
    orderNumber,
    reference: data.reference || data?.transaction?.reference || '',
    phone: normalizedPhone,
    amount: montant,
    currency: devise,
    message: data?.simply_pay?.message
      || data?.message
      || 'Validez le push sur votre téléphone',
    raw: data,
  };
}

/**
 * Vérifie le statut d'une transaction.
 * Succès uniquement si code === "1"
 */
export async function checkSimplyPayStatus(orderNumber) {
  const { apiKey } = getConfig();
  const id = String(orderNumber || '').trim();
  if (!id) throw new Error('orderNumber manquant pour la vérification');

  const res = await fetch(
    `${SIMPLY_PAY_BASE}/checkstatus-ordernumber/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: buildHeaders(apiKey),
    }
  );

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Réponse SimplyPaye invalide lors de la vérification');
  }

  const code = String(data.code ?? '');
  return {
    success: code === '1',
    code,
    message: data.message || '',
    reference: data.reference || '',
    montant: data.montant,
    devise: data.devise,
    channel: data.channel,
    raw: data,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initie puis attend la confirmation utilisateur (polling).
 */
export async function collectSimplyPayPayment({
  phone,
  amount,
  currency = 'CDF',
  reference = '',
  pollIntervalMs = 4000,
  timeoutMs = 100000,
} = {}) {
  const initiated = await initiateSimplyPayPayment({
    phone,
    amount,
    currency,
    reference,
  });

  const started = Date.now();
  let last = null;

  // Premier délai pour laisser le push arriver
  await sleep(Math.min(pollIntervalMs, 5000));

  while (Date.now() - started < timeoutMs) {
    last = await checkSimplyPayStatus(initiated.orderNumber);
    if (last.success) {
      return {
        ...initiated,
        paid: true,
        status: last,
      };
    }
    // code explicite d'échec définitif (hors attente)
    const msg = String(last.message || '').toLowerCase();
    if (
      last.code === '2'
      || /annul|refus|échou|echec|échec|expire|timeout|insuffisant/.test(msg)
    ) {
      throw new Error(last.message || 'Le paiement n\'a pas abouti');
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    last?.message
      || 'Délai dépassé : validez le push Mobile Money puis réessayez'
  );
}
