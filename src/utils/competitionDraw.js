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

  return {
    fights,
    bye: bye ? { ...bye, label: judokaLabel(bye) } : null,
  };
}

function weightSortValue(poids) {
  const n = Number(normalizeWeight(poids));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Individuel : combats par poids, séparés Garçons / Filles.
 */
export function buildWeightDraw(registrations) {
  const weighed = (registrations || []).filter((r) => String(r.poids || '').trim());
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
      const { fights, bye } = pairMembers(members, key);
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
 * Par équipe : combats regroupés par club / équipe, séparés Garçons / Filles puis poids.
 */
export function buildTeamDraw(registrations) {
  const weighed = (registrations || []).filter((r) => String(r.poids || '').trim());
  const byTeam = new Map();

  for (const r of weighed) {
    const team = (r.club || '').trim() || 'Sans équipe';
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(r);
  }

  const groups = [];

  [...byTeam.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .forEach(([team, members]) => {
      const genderBuckets = new Map();
      for (const r of members) {
        const sexe = r.sexe === 'F' ? 'F' : 'M';
        const poids = normalizeWeight(r.poids);
        const key = `${sexe}|${poids}`;
        if (!genderBuckets.has(key)) genderBuckets.set(key, []);
        genderBuckets.get(key).push(r);
      }

      const subGroups = [...genderBuckets.entries()]
        .map(([key, list]) => {
          const [sexe, poids] = key.split('|');
          const { fights, bye } = pairMembers(list, `${team}|${key}`);
          return {
            key: `${team}|${key}`,
            mode: 'equipe',
            title: `${team} · ${sexeLabel(sexe)} · ${poids} kg`,
            team,
            poids,
            sexe,
            sexeLabel: sexeLabel(sexe),
            count: list.length,
            fights,
            bye,
          };
        })
        .sort((a, b) => {
          if (a.sexe !== b.sexe) return a.sexe === 'M' ? -1 : 1;
          return weightSortValue(a.poids) - weightSortValue(b.poids);
        });

      groups.push(...subGroups);
    });

  return {
    mode: 'equipe',
    modeLabel: 'Par Équipe',
    totalJudokas: weighed.length,
    totalFights: groups.reduce((sum, g) => sum + g.fights.length, 0),
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
