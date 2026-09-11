import { teamCategoryKey } from './weightCategories';

function normalizeWeight(poids) {
  const n = Number(String(poids).replace(',', '.').trim());
  if (!Number.isFinite(n)) return String(poids || '').trim();
  return String(Math.round(n * 10) / 10);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function judokaLabel(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || 'Judoka';
}

function sexeLabel(sexe) {
  return sexe === 'F' ? 'Filles' : 'Garçons';
}

function pairMembers(members, keyPrefix) {
  // Classement / appariement strictement aléatoire à chaque tirage
  const shuffled = shuffle(members);
  const fights = [];
  let bye = null;

  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 >= shuffled.length) {
      bye = shuffled[i];
      break;
    }
    fights.push({
      id: `${keyPrefix}-${i / 2 + 1}`,
      a: shuffled[i],
      b: shuffled[i + 1],
      labelA: judokaLabel(shuffled[i]),
      labelB: judokaLabel(shuffled[i + 1]),
    });
  }

  // Mélanger aussi l'ordre des combats (positions dans la grille)
  return {
    fights: shuffle(fights),
    bye: bye ? { ...bye, label: judokaLabel(bye) } : null,
    seedOrder: shuffled.map((r) => ({
      ...r,
      id: r.id,
      label: judokaLabel(r),
      club: r.club || '',
    })),
  };
}

function weightSortValue(poids) {
  const n = Number(normalizeWeight(poids));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function getMode(r) {
  const taille = String(r?.taille || '');
  if (r?.mode_inscription === 'equipe' || taille === '__mode_equipe__' || taille.startsWith('__mode_equipe__:')) {
    return 'equipe';
  }
  return 'individuel';
}

function getTeamRole(r) {
  if (r?.role_equipe === 'remplacant') return 'remplacant';
  const taille = String(r?.taille || '');
  if (taille.endsWith(':remplacant') || /remplacant/i.test(taille)) return 'remplacant';
  if (String(r?.categorie || '').toLowerCase().includes('rempl')) return 'remplacant';
  return 'principal';
}

/**
 * Individuel : combats par poids, séparés Garçons / Filles.
 */
export function buildWeightDraw(registrations) {
  const weighed = (registrations || []).filter((r) => (
    getMode(r) === 'individuel' && String(r.poids || '').trim()
  ));
  const buckets = new Map();

  for (const r of weighed) {
    const poids = normalizeWeight(r.poids);
    const sexe = r.sexe === 'F' ? 'F' : 'M';
    const key = `${sexe}|${poids}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const groups = [...buckets.entries()]
    .map(([key, members]) => {
      const [sexe, poids] = key.split('|');
      const { fights, bye, seedOrder } = pairMembers(members, key);
      return {
        key,
        mode: 'individuel',
        title: `${sexeLabel(sexe)} · ${poids} kg`,
        poids,
        sexe,
        sexeLabel: sexeLabel(sexe),
        count: members.length,
        fights,
        bye,
        seedOrder,
      };
    })
    .sort((a, b) => {
      if (a.sexe !== b.sexe) return a.sexe === 'M' ? -1 : 1;
      return weightSortValue(a.poids) - weightSortValue(b.poids);
    });

  return {
    mode: 'individuel',
    modeLabel: 'Individuel',
    totalJudokas: weighed.length,
    totalFights: groups.reduce((sum, g) => sum + g.fights.length, 0),
    groups,
  };
}

/**
 * Par équipe : Club X vs Club Y (aléatoire), puis Principal vs Principal
 * dans chaque catégorie de poids commune. Un club est éligible s’il a des
 * judokas (au moins un Principal) dans au moins 3 catégories de poids.
 */
export function buildTeamDraw(registrations, { minCategories = 3 } = {}) {
  const teamRegs = (registrations || []).filter((r) => getMode(r) === 'equipe');

  const clubsMap = new Map();
  for (const r of teamRegs) {
    const sexe = r.sexe === 'F' ? 'F' : 'M';
    const club = (r.club || '').trim() || 'Sans club';
    const clubKey = `${sexe}::${club}`;
    const poids = teamCategoryKey(r);
    if (!poids) continue;
    if (!clubsMap.has(clubKey)) clubsMap.set(clubKey, { club, sexe, byWeight: new Map() });
    const team = clubsMap.get(clubKey);
    if (!team.byWeight.has(poids)) team.byWeight.set(poids, { principal: null, remplacant: null, members: [] });
    const bucket = team.byWeight.get(poids);
    bucket.members.push(r);
    const role = getTeamRole(r);
    if (!bucket[role]) bucket[role] = r;
  }

  const eligible = [...clubsMap.values()]
    .map((team) => {
      const weights = [...team.byWeight.entries()]
        .filter(([, bucket]) => bucket.principal)
        .map(([poids, bucket]) => ({ poids, ...bucket }));
      return {
        club: team.club,
        sexe: team.sexe,
        weights,
        byWeight: new Map(weights.map((w) => [w.poids, w])),
      };
    })
    .filter((team) => team.weights.length >= minCategories);

  const groups = [];
  let totalFights = 0;
  const seedOrder = [];

  for (const sexe of ['M', 'F']) {
    const pool = shuffle(eligible.filter((t) => t.sexe === sexe));
    const matches = [];
    let byeClub = null;
    seedOrder.push(...pool.flatMap((t) => t.weights.flatMap((w) => w.members)));

    for (let i = 0; i < pool.length; i += 2) {
      if (i + 1 >= pool.length) {
        byeClub = pool[i];
        break;
      }
      const teamA = pool[i];
      const teamB = pool[i + 1];
      const poidsSet = new Set([
        ...teamA.weights.map((w) => w.poids),
        ...teamB.weights.map((w) => w.poids),
      ]);
      const byWeight = [...poidsSet]
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((poids) => {
          const a = teamA.byWeight.get(poids);
          const b = teamB.byWeight.get(poids);
          if (!a?.principal || !b?.principal) return null;
          return {
            poids: String(poids).split('|').slice(1).join('|') || poids,
            fights: [{
              id: `${teamA.club}-${teamB.club}-${poids}`,
              a: a.principal,
              b: b.principal,
              labelA: judokaLabel(a.principal),
              labelB: judokaLabel(b.principal),
              poids,
            }],
          };
        })
        .filter(Boolean);

      const flatFights = byWeight.flatMap((w) => w.fights);
      if (!flatFights.length) continue;
      totalFights += flatFights.length;
      matches.push({
        id: `${sexe}-${teamA.club}-vs-${teamB.club}`,
        clubA: teamA.club,
        clubB: teamB.club,
        labelA: teamA.club,
        labelB: teamB.club,
        byWeight,
        fights: flatFights,
      });
    }

    if (matches.length || byeClub) {
      groups.push({
        key: `equipe-${sexe}`,
        mode: 'equipe',
        title: sexe === 'F' ? 'Filles' : 'Garçons',
        count: pool.reduce((n, t) => n + t.weights.reduce((m, w) => m + w.members.length, 0), 0),
        matches: shuffle(matches),
        fights: [],
        bye: byeClub ? { label: byeClub.club, club: byeClub.club } : null,
        seedOrder: pool.flatMap((t) => t.weights.flatMap((w) => w.members)),
      });
    }
  }

  return {
    mode: 'equipe',
    modeLabel: 'Par Équipe',
    totalJudokas: seedOrder.length,
    totalFights,
    groups,
  };
}

/** Liste triée pour export PDF : Garçons puis Filles, chacun par poids croissant. */
export function sortRegistrationsByGenderAndWeight(registrations) {
  return [...(registrations || [])].sort((a, b) => {
    const sexeA = a.sexe === 'F' ? 1 : 0;
    const sexeB = b.sexe === 'F' ? 1 : 0;
    if (sexeA !== sexeB) return sexeA - sexeB;

    const wa = weightSortValue(a.poids);
    const wb = weightSortValue(b.poids);
    if (wa !== wb) return wa - wb;

    const nameA = `${a.nom || ''} ${a.prenom || ''}`.trim().toLowerCase();
    const nameB = `${b.nom || ''} ${b.prenom || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB, 'fr');
  });
}
