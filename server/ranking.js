import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled } from './supabase.js';
import { dataDir } from './paths.js';
import { DEFAULT_JUDO_FEDERATION_ID, getUserFederationId } from './federations.js';
import { filterJudokas, getScopedClubNames, isCoordon } from './permissions.js';
import { getAllJudokas } from './database.js';
import { getAllUsers } from './users.js';

const rulesPath = path.join(dataDir, 'ranking_rules.json');
const resultsPath = path.join(dataDir, 'ranking_results.json');

function ensureJson(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback = []) {
  ensureJson(filePath, fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureJson(filePath, Array.isArray(data) ? [] : {});
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Barème issu des règles Ranking FCJ (PDF). */
export function getDefaultRankingRules() {
  return {
    season_label: `Saison ${new Date().getFullYear()}`,
    best_results_count: 4,
    levels: [
      { key: 'A', label: 'Championnat national', points: 1000 },
      { key: 'B', label: 'Tournoi national', points: 700 },
      { key: 'C', label: 'Tournoi interprovincial', points: 500 },
      { key: 'D', label: 'Championnat provincial', points: 300 },
      { key: 'E', label: 'Tournoi local homologué', points: 150 },
    ],
    result_coefficients: [
      { place: 1, label: '1er - Médaille d\'or', percent: 100 },
      { place: 2, label: '2e - Médaille d\'argent', percent: 70 },
      { place: 3, label: '3e - Médaille de bronze', percent: 50 },
      { place: 5, label: '5e place', percent: 36 },
      { place: 7, label: '7e place', percent: 26 },
      { place: 9, label: '9e place', percent: 16 },
      { place: 0, label: 'Participation (sans victoire)', percent: 5 },
    ],
    tie_breakers: [
      'Plus de médailles d\'or',
      'Plus de points en compétitions niveau A',
      'Plus de victoires',
      'Confrontation directe',
      'Meilleur résultat de la dernière compétition',
    ],
  };
}

export function normalizeRankingRules(raw = {}) {
  const base = getDefaultRankingRules();
  const src = raw && typeof raw === 'object' ? raw : {};
  const levels = Array.isArray(src.levels) && src.levels.length
    ? src.levels.map((l) => ({
      key: String(l.key || '').trim().toUpperCase().slice(0, 4) || 'A',
      label: String(l.label || '').trim().slice(0, 80) || 'Compétition',
      points: Math.max(0, Number(l.points) || 0),
    }))
    : base.levels;
  const result_coefficients = Array.isArray(src.result_coefficients) && src.result_coefficients.length
    ? src.result_coefficients.map((c) => ({
      place: Number(c.place) || 0,
      label: String(c.label || '').trim().slice(0, 80) || `Place ${c.place}`,
      percent: Math.max(0, Math.min(100, Number(c.percent) || 0)),
    }))
    : base.result_coefficients;
  return {
    season_label: String(src.season_label || base.season_label).trim().slice(0, 60) || base.season_label,
    best_results_count: Math.max(1, Math.min(20, Number(src.best_results_count) || base.best_results_count)),
    levels,
    result_coefficients,
    tie_breakers: Array.isArray(src.tie_breakers) && src.tie_breakers.length
      ? src.tie_breakers.map((t) => String(t).trim()).filter(Boolean)
      : base.tie_breakers,
  };
}

export function computeResultPoints(rules, { competition_level, place, wins = 0 }) {
  const normalized = normalizeRankingRules(rules);
  const level = normalized.levels.find((l) => String(l.key).toUpperCase() === String(competition_level || '').toUpperCase())
    || normalized.levels[0];
  const basePoints = Number(level?.points) || 0;
  const winCount = Number(wins) || 0;
  // Sans victoire : participation uniquement
  if (winCount <= 0) {
    const participation = normalized.result_coefficients.find((c) => Number(c.place) === 0)
      || { percent: 5 };
    return Math.round(basePoints * (Number(participation.percent) || 5) / 100);
  }
  const coeff = normalized.result_coefficients.find((c) => Number(c.place) === Number(place))
    || normalized.result_coefficients.find((c) => Number(c.place) === 0)
    || { percent: 5 };
  return Math.round(basePoints * (Number(coeff.percent) || 0) / 100);
}

export function canManageRankingRules(user) {
  if (!user) return false;
  if (user.type === 'admin') return true;
  return isCoordon(user);
}

export function canViewRanking(user) {
  if (!user) return false;
  if (user.type === 'admin') return true;
  if (user.type === 'ligue' || user.type === 'entente' || user.type === 'club') return true;
  if (user.type === 'federation') {
    const allowed = [
      'Coordon',
      'Coordon Adjoint',
      'Secrétaire Général',
      'Directeur Compétition',
      'Responsable Grade',
    ];
    return allowed.includes(user.fonction);
  }
  return false;
}

async function readRulesMap() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('ranking_rules').select('*');
      if (error) throw error;
      const map = {};
      for (const row of data || []) {
        map[row.federation_id] = normalizeRankingRules({
          season_label: row.season_label,
          best_results_count: row.best_results_count,
          levels: row.levels,
          result_coefficients: row.result_coefficients,
          tie_breakers: row.tie_breakers,
        });
      }
      return map;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(rulesPath, {});
}

async function writeRulesMap(map) {
  if (isSupabaseEnabled()) {
    try {
      // handled per federation in saveRankingRules
      return;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  writeJson(rulesPath, map);
}

export async function getRankingRules(federationId) {
  const fedId = federationId || DEFAULT_JUDO_FEDERATION_ID;
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('ranking_rules')
        .select('*')
        .eq('federation_id', fedId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return normalizeRankingRules({
          season_label: data.season_label,
          best_results_count: data.best_results_count,
          levels: data.levels,
          result_coefficients: data.result_coefficients,
          tie_breakers: data.tie_breakers,
        });
      }
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  const map = await readRulesMap();
  return normalizeRankingRules(map[fedId] || getDefaultRankingRules());
}

export async function saveRankingRules(federationId, patch, user) {
  if (!canManageRankingRules(user)) {
    throw new Error('Seuls Admin et Coordon peuvent définir les règles Ranking');
  }
  const fedId = federationId || getUserFederationId(user) || DEFAULT_JUDO_FEDERATION_ID;
  const next = normalizeRankingRules(patch);
  if (isSupabaseEnabled()) {
    try {
      const row = {
        federation_id: fedId,
        season_label: next.season_label,
        best_results_count: next.best_results_count,
        levels: next.levels,
        result_coefficients: next.result_coefficients,
        tie_breakers: next.tie_breakers,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      };
      const { error } = await getSupabase().from('ranking_rules').upsert(row, { onConflict: 'federation_id' });
      if (error) throw error;
      return next;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  const map = await readRulesMap();
  map[fedId] = next;
  await writeRulesMap(map);
  writeJson(rulesPath, map);
  return next;
}

async function readAllResults() {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('ranking_results')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  return readJson(resultsPath, []);
}

async function writeAllResults(list) {
  writeJson(resultsPath, list);
}

export async function addRankingResult(entry, user) {
  if (!canManageRankingRules(user)) {
    throw new Error('Seuls Admin et Coordon peuvent enregistrer des résultats Ranking');
  }
  const fedId = getUserFederationId(user) || DEFAULT_JUDO_FEDERATION_ID;
  const rules = await getRankingRules(fedId);
  const wins = Number(entry.wins) || 0;
  const place = Number(entry.place) || 0;
  const points = computeResultPoints(rules, {
    competition_level: entry.competition_level,
    place,
    wins,
  });
  const row = {
    id: uuidv4(),
    federation_id: fedId,
    judoka_id: entry.judoka_id || null,
    judoka_nom: String(entry.judoka_nom || '').trim(),
    judoka_prenom: String(entry.judoka_prenom || '').trim(),
    judoka_club: String(entry.judoka_club || '').trim(),
    judoka_sexe: entry.judoka_sexe === 'F' ? 'F' : 'M',
    categorie_age: String(entry.categorie_age || 'Seniors').trim(),
    categorie_poids: String(entry.categorie_poids || entry.categorie || '').trim(),
    competition_name: String(entry.competition_name || '').trim(),
    competition_level: String(entry.competition_level || 'A').trim().toUpperCase(),
    place,
    wins,
    gold_medals: place === 1 ? 1 : 0,
    points,
    counted: true,
    season_label: rules.season_label,
    competition_date: entry.competition_date || null,
    note: String(entry.note || '').trim(),
    created_by: user?.id || null,
    created_by_name: user?.prenom || user?.nom || user?.username || '',
    created_at: new Date().toISOString(),
  };
  if (!row.judoka_nom || !row.judoka_prenom) {
    throw new Error('Nom et prénom de l\'athlète obligatoires');
  }
  if (!row.competition_name) throw new Error('Nom de la compétition obligatoire');
  if (!row.categorie_poids) throw new Error('Catégorie de poids obligatoire');

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase().from('ranking_results').insert(row).select('*').maybeSingle();
      if (error) throw error;
      return data || row;
    } catch (err) {
      if (!/relation|does not exist|schema cache/i.test(err.message || '')) throw err;
    }
  }
  const list = await readAllResults();
  list.unshift(row);
  await writeAllResults(list);
  return row;
}

function aggregateAthlete(results, rules) {
  const bestN = rules.best_results_count || 4;
  const sorted = [...results].sort((a, b) => Number(b.points) - Number(a.points));
  const best = sorted.slice(0, bestN);
  const total = best.reduce((sum, r) => sum + Number(r.points || 0), 0);
  const gold = results.reduce((sum, r) => sum + (Number(r.gold_medals) || (Number(r.place) === 1 ? 1 : 0)), 0);
  const wins = results.reduce((sum, r) => sum + (Number(r.wins) || 0), 0);
  const pointsA = results
    .filter((r) => String(r.competition_level).toUpperCase() === 'A')
    .reduce((sum, r) => sum + Number(r.points || 0), 0);
  const sample = results[0] || {};
  return {
    judoka_id: sample.judoka_id || null,
    nom: sample.judoka_nom,
    prenom: sample.judoka_prenom,
    club: sample.judoka_club,
    sexe: sample.judoka_sexe,
    categorie_age: sample.categorie_age,
    categorie_poids: sample.categorie_poids,
    points: total,
    gold_medals: gold,
    wins,
    points_level_a: pointsA,
    results_count: results.length,
    best_results: best,
    all_results: sorted,
  };
}

function compareAthletes(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gold_medals !== a.gold_medals) return b.gold_medals - a.gold_medals;
  if (b.points_level_a !== a.points_level_a) return b.points_level_a - a.points_level_a;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return String(a.nom || '').localeCompare(String(b.nom || ''), 'fr');
}

function athleteKey(r) {
  if (r.judoka_id) return `id:${r.judoka_id}`;
  return `name:${String(r.judoka_nom || '').toLowerCase()}|${String(r.judoka_prenom || '').toLowerCase()}|${String(r.judoka_club || '').toLowerCase()}`;
}

export async function getRankingBoard(user, {
  sexe = null,
  categorie_age = null,
  categorie_poids = null,
  season_label = null,
} = {}) {
  if (!canViewRanking(user)) throw new Error('Accès Ranking non autorisé');
  const fedId = getUserFederationId(user) || DEFAULT_JUDO_FEDERATION_ID;
  const rules = await getRankingRules(fedId);
  const season = season_label || rules.season_label;
  let results = (await readAllResults()).filter((r) =>
    String(r.federation_id) === String(fedId)
    && String(r.season_label || '') === String(season)
  );

  // Scope ligue / entente / club
  const users = await getAllUsers();
  const judokas = await getAllJudokas();
  const scopedJudokas = filterJudokas(judokas, user, users);
  const scopedIds = new Set(scopedJudokas.map((j) => String(j.id)));
  const scopedClubs = new Set(
    (user.type === 'ligue' || user.type === 'entente'
      ? getScopedClubNames(users, user)
      : user.type === 'club'
        ? [user.nom_club]
        : []
    ).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );

  if (user.type === 'ligue' || user.type === 'entente' || user.type === 'club') {
    results = results.filter((r) => {
      if (r.judoka_id && scopedIds.has(String(r.judoka_id))) return true;
      const club = String(r.judoka_club || '').trim().toLowerCase();
      return club && scopedClubs.has(club);
    });
  }

  if (sexe) results = results.filter((r) => r.judoka_sexe === sexe);
  if (categorie_age) {
    results = results.filter((r) =>
      String(r.categorie_age || '').toLowerCase() === String(categorie_age).toLowerCase()
    );
  }
  if (categorie_poids) {
    results = results.filter((r) =>
      String(r.categorie_poids || '').toLowerCase() === String(categorie_poids).toLowerCase()
    );
  }

  const byAthlete = new Map();
  for (const r of results) {
    const key = athleteKey(r);
    if (!byAthlete.has(key)) byAthlete.set(key, []);
    byAthlete.get(key).push(r);
  }

  const board = [...byAthlete.values()]
    .map((rows) => aggregateAthlete(rows, rules))
    .sort(compareAthletes)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    rules,
    season_label: season,
    can_manage_rules: canManageRankingRules(user),
    total_athletes: board.length,
    board,
  };
}

export async function getAthleteRanking(user, judokaId) {
  if (!canViewRanking(user)) throw new Error('Accès Ranking non autorisé');
  const judoka = (await getAllJudokas()).find((j) => String(j.id) === String(judokaId));
  if (!judoka) throw new Error('Athlète introuvable');

  const users = await getAllUsers();
  const scoped = filterJudokas([judoka], user, users);
  if (!scoped.length) throw new Error('Accès non autorisé à cet athlète');

  const fedId = getUserFederationId(user) || judoka.federation_id || DEFAULT_JUDO_FEDERATION_ID;
  const rules = await getRankingRules(fedId);
  const season = rules.season_label;
  const all = (await readAllResults()).filter((r) =>
    String(r.federation_id) === String(fedId)
    && String(r.season_label || '') === String(season)
  );

  const athleteResults = all.filter((r) =>
    String(r.judoka_id || '') === String(judokaId)
    || (
      String(r.judoka_nom || '').toLowerCase() === String(judoka.nom || '').toLowerCase()
      && String(r.judoka_prenom || '').toLowerCase() === String(judoka.prenom || '').toLowerCase()
    )
  );

  const weight = athleteResults[0]?.categorie_poids || judoka.categorie || '';
  const sexe = athleteResults[0]?.judoka_sexe || judoka.sexe || 'M';
  const age = athleteResults[0]?.categorie_age || 'Seniors';

  const categoryResults = all.filter((r) =>
    String(r.categorie_poids || '').toLowerCase() === String(weight).toLowerCase()
    && r.judoka_sexe === sexe
    && String(r.categorie_age || 'Seniors').toLowerCase() === String(age).toLowerCase()
  );

  const byAthlete = new Map();
  for (const r of categoryResults) {
    const key = athleteKey(r);
    if (!byAthlete.has(key)) byAthlete.set(key, []);
    byAthlete.get(key).push(r);
  }
  const board = [...byAthlete.values()]
    .map((rows) => aggregateAthlete(rows, rules))
    .sort(compareAthletes)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const selfKey = athleteKey({
    judoka_id: judoka.id,
    judoka_nom: judoka.nom,
    judoka_prenom: judoka.prenom,
    judoka_club: judoka.club,
  });
  const selfAgg = athleteResults.length
    ? aggregateAthlete(athleteResults, rules)
    : {
      judoka_id: judoka.id,
      nom: judoka.nom,
      prenom: judoka.prenom,
      club: judoka.club,
      sexe: judoka.sexe,
      categorie_age: age,
      categorie_poids: weight,
      points: 0,
      gold_medals: 0,
      wins: 0,
      points_level_a: 0,
      results_count: 0,
      best_results: [],
      all_results: [],
    };
  const rankedSelf = board.find((b) =>
    (b.judoka_id && String(b.judoka_id) === String(judoka.id))
    || (`name:${String(b.nom || '').toLowerCase()}|${String(b.prenom || '').toLowerCase()}|${String(b.club || '').toLowerCase()}` === selfKey)
  );

  return {
    judoka: {
      id: judoka.id,
      nom: judoka.nom,
      prenom: judoka.prenom,
      club: judoka.club,
      sexe: judoka.sexe,
      categorie: judoka.categorie,
      numero_carte: judoka.numero_carte,
      grade: judoka.grade,
    },
    season_label: season,
    categorie_age: age,
    categorie_poids: weight,
    rank: rankedSelf?.rank || null,
    category_size: board.length,
    points: selfAgg.points,
    gold_medals: selfAgg.gold_medals,
    wins: selfAgg.wins,
    best_results: selfAgg.best_results,
    all_results: selfAgg.all_results,
    category_board: board.slice(0, 20),
    rules,
  };
}
