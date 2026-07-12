function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizePayload(data) {
  if (!data || typeof data !== 'object') return null;

  const id = data.id || data.judoka_id || data.judokaId;
  const carte = data.carte || data.numero_carte || data.numeroCarte || data.card;
  const org = data.org || data.organization;

  if (org && org !== 'FENACOJU') return null;
  if (!id && !carte) return null;

  return {
    org: 'FENACOJU',
    id: id || null,
    carte: carte ? String(carte).trim().toUpperCase() : null,
    nom: data.nom || null,
    prenom: data.prenom || null,
    club: data.club || null,
  };
}

export function parseCardQr(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const direct = normalizePayload(tryParseJson(raw));
  if (direct) return direct;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const embedded = normalizePayload(tryParseJson(jsonMatch[0]));
    if (embedded) return embedded;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const param = url.searchParams.get('data')
        || url.searchParams.get('qr')
        || url.searchParams.get('carte')
        || url.searchParams.get('id');
      if (param) {
        const fromUrl = parseCardQr(param);
        if (fromUrl) return fromUrl;
      }
      const pathCard = url.pathname.match(/(FCJ-\d{4}-\d+)/i);
      if (pathCard) {
        return { org: 'FENACOJU', id: null, carte: pathCard[1].toUpperCase() };
      }
    } catch {
      // URL invalide
    }
  }

  const cardMatch = raw.match(/FCJ-\d{4}-\d+/i);
  if (cardMatch) {
    return { org: 'FENACOJU', id: null, carte: cardMatch[0].toUpperCase() };
  }

  return null;
}
