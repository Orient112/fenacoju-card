/**
 * Identifiants hiérarchiques :
 * Ligue  → L01
 * Entente → L01-E02
 * Club   → L01-E02-C03  (ou L01-C03 si rattaché directement à une ligue)
 */

const PREFIX = {
  ligue: 'L',
  entente: 'E',
  club: 'C',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function sameFederation(a, b) {
  const DEFAULT_FED = '00000000-0000-4000-8000-000000000001';
  const fa = a?.federation_id || DEFAULT_FED;
  const fb = b?.federation_id || DEFAULT_FED;
  return String(fa) === String(fb);
}

function parseSegment(code, letter) {
  const re = new RegExp(`${letter}(\\d+)`, 'i');
  const m = String(code || '').match(re);
  return m ? parseInt(m[1], 10) : 0;
}

export function nextSiblingCode(siblings, type, parentCode = '') {
  const letter = PREFIX[type];
  if (!letter) return '';
  let max = 0;
  for (const s of siblings) {
    const code = s.org_code || '';
    if (parentCode && !code.startsWith(`${parentCode}-`) && code !== parentCode) continue;
    const n = parseSegment(code.split('-').pop(), letter);
    if (n > max) max = n;
  }
  const segment = `${letter}${pad(max + 1)}`;
  return parentCode ? `${parentCode}-${segment}` : segment;
}

export function allocateOrgCode(users, newUser, parent) {
  const type = newUser.type;
  if (!['ligue', 'entente', 'club'].includes(type)) return null;

  const fedUsers = (users || []).filter((u) => sameFederation(u, newUser) || sameFederation(u, parent));

  if (type === 'ligue') {
    const siblings = fedUsers.filter((u) => u.type === 'ligue' && u.org_code);
    return nextSiblingCode(siblings, 'ligue', '');
  }

  if (type === 'entente') {
    const parentCode = parent?.type === 'ligue' ? (parent.org_code || null) : null;
    // Si parent ligue sans code, on génère d'abord un code ligue virtuel depuis les siblings
    let base = parentCode;
    if (!base && parent?.type === 'ligue') {
      base = nextSiblingCode(fedUsers.filter((u) => u.type === 'ligue'), 'ligue', '');
    }
    if (!base) {
      // Entente sans ligue parente claire : code E01 au niveau fédération
      return nextSiblingCode(fedUsers.filter((u) => u.type === 'entente' && !String(u.org_code || '').includes('-L') && /^E\d+$/i.test(u.org_code || '')), 'entente', '');
    }
    const siblings = fedUsers.filter((u) => u.type === 'entente' && u.org_code && u.org_code.startsWith(`${base}-`));
    return nextSiblingCode(siblings, 'entente', base);
  }

  // club
  let base = '';
  if (parent?.type === 'entente' && parent.org_code) base = parent.org_code;
  else if (parent?.type === 'ligue' && parent.org_code) base = parent.org_code;
  else if (parent?.org_code) base = parent.org_code;

  if (!base) {
    return nextSiblingCode(fedUsers.filter((u) => u.type === 'club' && /^C\d+$/i.test(u.org_code || '')), 'club', '');
  }
  const siblings = fedUsers.filter((u) => u.type === 'club' && u.org_code && u.org_code.startsWith(`${base}-`));
  return nextSiblingCode(siblings, 'club', base);
}

export function ensureOrgCodes(users = []) {
  const list = [...users];
  const byId = new Map(list.map((u) => [u.id, u]));
  const updates = [];

  const sorted = [...list].sort((a, b) => {
    const rank = { ligue: 1, entente: 2, club: 3 };
    return (rank[a.type] || 9) - (rank[b.type] || 9);
  });

  for (const user of sorted) {
    if (!['ligue', 'entente', 'club'].includes(user.type)) continue;
    if (user.org_code) continue;
    const parent = user.parent_id ? byId.get(user.parent_id) : null;
    const code = allocateOrgCode(list, user, parent);
    if (code) {
      user.org_code = code;
      byId.set(user.id, user);
      updates.push({ id: user.id, org_code: code });
    }
  }
  return { users: list, updates };
}

export function resolveJudokaHierarchy(judoka, users = []) {
  const clubName = String(judoka?.club || '').trim().toLowerCase();
  if (!clubName) {
    return {
      hierarchy_id: '',
      ligue_code: '',
      entente_code: '',
      club_code: '',
      ligue_nom: '',
      entente_nom: '',
      club_nom: judoka?.club || '',
    };
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  const clubUser = users.find(
    (u) => u.type === 'club' && String(u.nom_club || '').trim().toLowerCase() === clubName
  );

  if (!clubUser) {
    return {
      hierarchy_id: '',
      ligue_code: '',
      entente_code: '',
      club_code: '',
      ligue_nom: '',
      entente_nom: '',
      club_nom: judoka.club || '',
    };
  }

  let entente = null;
  let ligue = null;
  let cursor = clubUser.parent_id ? byId.get(clubUser.parent_id) : null;
  while (cursor) {
    if (cursor.type === 'entente' && !entente) entente = cursor;
    if (cursor.type === 'ligue' && !ligue) ligue = cursor;
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null;
  }

  const hierarchy_id = clubUser.org_code
    || [ligue?.org_code, entente?.org_code, clubUser.org_code].filter(Boolean).join('-')
    || '';

  return {
    hierarchy_id,
    ligue_code: ligue?.org_code || '',
    entente_code: entente?.org_code || '',
    club_code: clubUser.org_code || '',
    ligue_nom: ligue?.nom_organisation || ligue?.nom || '',
    entente_nom: entente?.nom_organisation || entente?.nom || '',
    club_nom: clubUser.nom_club || judoka.club || '',
  };
}

export function enrichJudokasWithHierarchy(judokas, users) {
  return (judokas || []).map((j) => {
    const h = resolveJudokaHierarchy(j, users);
    return { ...j, ...h };
  });
}

export function gradesBreakdown(judokas = []) {
  const map = {};
  for (const j of judokas) {
    const grade = String(j.grade || 'Non défini').trim() || 'Non défini';
    map[grade] = (map[grade] || 0) + 1;
  }
  return Object.entries(map)
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => b.count - a.count || a.grade.localeCompare(b.grade, 'fr'));
}
