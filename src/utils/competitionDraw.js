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
  if (r?.mode_inscription === 'equipe' || r?.taille === '__mode_equipe__') return 'equipe';
  return 'individuel';
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
 * Par équipe : appariement aléatoire Club X vs Club Y,
 * puis combats judoka vs judoka par catégorie de poids.
 * Un club n’entre dans une catégorie que s’il a au moins 5 judokas dans ce poids.
 */
export function buildTeamDraw(registrations, { minPerClub = 5 } = {}) {
  const teamRegs = (registrations || []).filter((r) => (
    getMode(r) === 'equipe' && String(r.poids || '').trim()
  ));

  const clubsMap = new Map();
  for (const r of teamRegs) {
    const club = (r.club || '').trim() || 'Sans club';
    const poids = normalizeWeight(r.poids);
    if (!clubsMap.has(club)) clubsMap.set(club, new Map());
    const byWeight = clubsMap.get(club);
    if (!byWeight.has(poids)) byWeight.set(poids, []);
    byWeight.get(poids).push(r);
  }

  const eligible = [...clubsMap.entries()]
    .map(([club, byWeight]) => {
      const weights = [...byWeight.entries()]
        .filter(([, members]) => members.length >= minPerClub)
        .map(([poids, members]) => ({ poids, members: shuffle(members) }));
      return { club, weights, byWeight: new Map(weights.map((w) => [w.poids, w.members])) };
    })
    .filter((team) => team.weights.length > 0);

  const shuffledClubs = shuffle(eligible);
  const matches = [];
  let byeClub = null;

  for (let i = 0; i < shuffledClubs.length; i += 2) {
    if (i + 1 >= shuffledClubs.length) {
      byeClub = shuffledClubs[i];
      break;
    }
    const teamA = shuffledClubs[i];
    const teamB = shuffledClubs[i + 1];
    const poidsSet = new Set([
      ...teamA.weights.map((w) => w.poids),
      ...teamB.weights.map((w) => w.poids),
    ]);
    const byWeight = [...poidsSet]
      .sort((a, b) => weightSortValue(a) - weightSortValue(b))
      .map((poids) => {
        const membersA = teamA.byWeight.get(poids) || [];
        const membersB = teamB.byWeight.get(poids) || [];
        if (membersA.length < minPerClub || membersB.length < minPerClub) return null;
        const pairCount = Math.min(membersA.length, membersB.length);
        const fights = [];
        for (let j = 0; j < pairCount; j++) {
          fights.push({
            id: `${teamA.club}-${teamB.club}-${poids}-${j + 1}`,
            a: membersA[j],
            b: membersB[j],
            labelA: judokaLabel(membersA[j]),
            labelB: judokaLabel(membersB[j]),
            poids,
          });
        }
        return { poids, fights: shuffle(fights) };
      })
      .filter(Boolean);

    const flatFights = byWeight.flatMap((w) => w.fights);
    if (!flatFights.length) continue;

    matches.push({
      id: `${teamA.club}-vs-${teamB.club}`,
      clubA: teamA.club,
      clubB: teamB.club,
      labelA: teamA.club,
      labelB: teamB.club,
      byWeight,
      fights: flatFights,
    });
  }

  const seedOrder = eligible.flatMap((t) => t.weights.flatMap((w) => w.members));
  const groups = [{
    key: 'equipe-rencontres',
    mode: 'equipe',
    title: 'Rencontres par équipe',
    count: seedOrder.length,
    matches: shuffle(matches),
    fights: [],
    bye: byeClub ? { label: byeClub.club, club: byeClub.club } : null,
    seedOrder,
  }].filter((g) => g.matches.length > 0 || g.bye);

  return {
    mode: 'equipe',
    modeLabel: 'Par Équipe',
    totalJudokas: seedOrder.length,
    totalFights: groups.reduce(
      (sum, g) => sum + g.matches.reduce((n, m) => n + m.fights.length, 0),
      0
    ),
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
