const CARD_NUMBER_RE = /(?:FCJ|FJC)-\d{4}-\d+/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeCardNumber(value) {
  if (!value) return null;
  const match = String(value).trim().match(CARD_NUMBER_RE);
  return match ? match[0].toUpperCase().replace(/^FJC-/, 'FCJ-') : null;
}

function buildPayload({ id = null, carte = null, nom = null, prenom = null, club = null, org = 'FENACOJU', raw = '' }) {
  return {
    org,
    id: id ? String(id).trim() : null,
    carte: normalizeCardNumber(carte),
    nom: nom ? String(nom).trim() : null,
    prenom: prenom ? String(prenom).trim() : null,
    club: club ? String(club).trim() : null,
    raw,
  };
}

function normalizePayload(data, raw = '') {
  if (!data || typeof data !== 'object') return null;

  const id = data.id || data.judoka_id || data.judokaId;
  const carte = data.carte || data.numero_carte || data.numeroCarte || data.card || data.numero;
  const org = data.org || data.organization || 'FENACOJU';

  if (!id && !carte) return null;

  return buildPayload({
    id,
    carte,
    nom: data.nom,
    prenom: data.prenom,
    club: data.club,
    org: String(org).toUpperCase() === 'FENACOJU' ? 'FENACOJU' : org,
    raw,
  });
}

export function hasResolvableQrPayload(payload) {
  if (!payload) return false;
  return Boolean(payload.id || payload.carte);
}

export function parseCardQr(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const direct = normalizePayload(tryParseJson(raw), raw);
  if (direct) return direct;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const embedded = normalizePayload(tryParseJson(jsonMatch[0]), raw);
    if (embedded) return embedded;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const param = url.searchParams.get('data')
        || url.searchParams.get('qr')
        || url.searchParams.get('carte')
        || url.searchParams.get('id')
        || url.searchParams.get('judoka');
      if (param) {
        const fromUrl = parseCardQr(param);
        if (fromUrl) return { ...fromUrl, raw };
      }

      const pathCard = url.pathname.match(CARD_NUMBER_RE);
      if (pathCard) {
        return buildPayload({ carte: pathCard[0], raw });
      }

      const pathUuid = url.pathname.match(UUID_RE);
      if (pathUuid) {
        return buildPayload({ id: pathUuid[0], raw });
      }
    } catch {
      // URL invalide
    }
  }

  const cardMatch = raw.match(CARD_NUMBER_RE);
  if (cardMatch) {
    return buildPayload({ carte: cardMatch[0], raw });
  }

  const uuidMatch = raw.match(UUID_RE);
  if (uuidMatch) {
    return buildPayload({ id: uuidMatch[0], raw });
  }

  return null;
}
