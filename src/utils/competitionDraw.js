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

/**
 * Groupe les judokas pesés par poids (+ sexe), mélange et crée des combats.
 * @returns {{ groups: Array<{ key: string, poids: string, sexe: string, fights: Array, bye: object|null }> }}
 */
export function buildWeightDraw(registrations) {
  const weighed = (registrations || []).filter((r) => String(r.poids || '').trim());
  const buckets = new Map();

  for (const r of weighed) {
    const poids = normalizeWeight(r.poids);
    const sexe = r.sexe || 'M';
    const key = `${sexe}|${poids}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const groups = [...buckets.entries()]
    .map(([key, members]) => {
      const [sexe, poids] = key.split('|');
      const shuffled = shuffle(members);
      const fights = [];
      let bye = null;

      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 >= shuffled.length) {
          bye = shuffled[i];
          break;
        }
        fights.push({
          id: `${key}-${i / 2 + 1}`,
          a: shuffled[i],
          b: shuffled[i + 1],
          labelA: judokaLabel(shuffled[i]),
          labelB: judokaLabel(shuffled[i + 1]),
        });
      }

      return {
        key,
        poids,
        sexe,
        sexeLabel: sexe === 'F' ? 'Féminin' : 'Masculin',
        count: members.length,
        fights,
        bye: bye
          ? { ...bye, label: judokaLabel(bye) }
          : null,
      };
    })
    .sort((a, b) => {
      if (a.sexe !== b.sexe) return a.sexe.localeCompare(b.sexe);
      return Number(a.poids) - Number(b.poids);
    });

  return {
    totalJudokas: weighed.length,
    totalFights: groups.reduce((sum, g) => sum + g.fights.length, 0),
    groups,
  };
}
