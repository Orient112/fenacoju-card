import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

let workerReady = false;

function ensurePdfWorker() {
  if (workerReady) return;
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  workerReady = true;
}

const AGE_MAP = {
  minime: 'Minimes',
  minimes: 'Minimes',
  cadet: 'Cadets',
  cadets: 'Cadets',
  junior: 'Juniors',
  juniors: 'Juniors',
  senior: 'Seniors',
  seniors: 'Seniors',
  sénior: 'Seniors',
  séniors: 'Seniors',
};

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseAge(raw) {
  const key = normalizeSpace(raw).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return AGE_MAP[key] || 'Seniors';
}

function parseSexe(raw) {
  const t = normalizeSpace(raw).toLowerCase();
  if (/fille|femin|femme|dames/.test(t)) return 'F';
  if (/garcon|garçon|mascul|homme|messieurs/.test(t)) return 'M';
  return 'M';
}

function parseWeight(raw) {
  const t = normalizeSpace(raw);
  const m = t.match(/([+-]?\d+(?:[.,]\d+)?)\s*kg/i);
  if (!m) return t;
  const sign = t.trim().startsWith('+') ? '+' : '-';
  const num = m[1].replace(',', '.');
  // +78 kg already has +, otherwise keep leading + from raw if present
  if (t.includes('+')) return `+${num.replace(/^\+/, '')} kg`;
  return `${sign === '+' ? '+' : '-'}${num.replace(/^-/, '')} kg`;
}

function parseAthleteSide(line) {
  // Blanc : Miradi Makiese (JC KONGO CENTRAL) - Gagnant
  const m = normalizeSpace(line).match(
    /^(?:Blanc|Bleu)\s*:\s*(.+?)\s*-\s*(Gagnant|Perdant)\s*$/i
  );
  if (!m) return null;
  let identity = normalizeSpace(m[1]);
  const outcome = /gagnant/i.test(m[2]) ? 'win' : 'loss';
  let club = '';
  const clubMatch = identity.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (clubMatch) {
    identity = normalizeSpace(clubMatch[1]);
    club = normalizeSpace(clubMatch[2]);
  }
  const parts = identity.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const prenom = parts[0];
  const nom = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  return { prenom, nom, club, outcome, fullName: identity };
}

function detectRound(header) {
  const h = normalizeSpace(header).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/finale\s+or|finale\s+d[' ]?or|gold\s+final/.test(h)) return 'gold';
  if (/finale\s+bronze|bronze\s+final/.test(h)) return 'bronze';
  if (/demi[- ]?finale|semi/.test(h)) return 'semi';
  if (/quart|1\/4/.test(h)) return 'quarter';
  if (/huitieme|1\/8|repechage|rep[eê]chage/.test(h)) return 'repechage';
  if (/poule|round\s*robin/.test(h)) return 'pool';
  return 'other';
}

function placeFromOutcome(round, outcome, currentPlace) {
  let next = null;
  if (round === 'gold') next = outcome === 'win' ? 1 : 2;
  else if (round === 'bronze') next = outcome === 'win' ? 3 : 5;
  else if (round === 'semi') next = outcome === 'win' ? 3 : 5;
  else if (round === 'quarter') next = outcome === 'win' ? 5 : 7;
  else if (round === 'repechage') next = outcome === 'win' ? 5 : 7;
  else if (round === 'pool' || round === 'other') next = outcome === 'win' ? 5 : 0;

  if (currentPlace == null || currentPlace === 0) return next ?? 0;
  if (next == null || next === 0) return currentPlace;
  return Math.min(currentPlace, next);
}

function parseCategoryFromHeader(header) {
  // Finale Or - Filles · Sénior · -90 kg - Finale Or - Tatami 1
  const clean = normalizeSpace(header);
  const parts = clean.split(/\s*[·•|]\s*/);
  let sexeRaw = '';
  let ageRaw = '';
  let weightRaw = '';
  for (const part of parts) {
    if (/fille|garcon|garçon|mascul|femin|homme|dame/i.test(part)) sexeRaw = part;
    else if (/minime|cadet|junior|s[eé]nior/i.test(part)) ageRaw = part;
    else if (/\d+\s*kg/i.test(part)) weightRaw = part;
  }
  // Fallback: search whole header
  if (!sexeRaw) {
    const sm = clean.match(/(Filles|Gar[cç]ons|Masculin|F[eé]minin|Hommes|Dames)/i);
    if (sm) sexeRaw = sm[1];
  }
  if (!ageRaw) {
    const am = clean.match(/(Minimes?|Cadets?|Juniors?|S[eé]niors?)/i);
    if (am) ageRaw = am[1];
  }
  if (!weightRaw) {
    const wm = clean.match(/([+-]?\d+(?:[.,]\d+)?\s*kg)/i);
    if (wm) weightRaw = wm[1];
  }
  return {
    judoka_sexe: parseSexe(sexeRaw || 'M'),
    categorie_age: parseAge(ageRaw || 'Seniors'),
    categorie_poids: parseWeight(weightRaw || ''),
  };
}

function athleteBucketKey(a) {
  return [
    String(a.judoka_sexe || ''),
    String(a.categorie_age || '').toLowerCase(),
    String(a.categorie_poids || '').toLowerCase(),
    String(a.judoka_prenom || '').toLowerCase(),
    String(a.judoka_nom || '').toLowerCase(),
  ].join('|');
}

function parseExportDate(text) {
  const m = String(text || '').match(/exporte\s+le\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

/**
 * Parse le texte brut d'un PDF "Resultats des combats".
 * Retourne une liste d'athlètes avec place + victoires par catégorie.
 */
export function parseCombatResultsText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '\n');
  if (!/resultats?\s+des\s+combats/i.test(text) && !/Blanc\s*:/i.test(text)) {
    throw new Error('PDF non reconnu : format "Resultats des combats" attendu');
  }

  const competition_date = parseExportDate(text);
  const lines = text.split('\n').map((l) => normalizeSpace(l)).filter(Boolean);
  const fights = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isFightHeader = /finale|demi|quart|repechage|rep[eê]chage|poule/i.test(line)
      && (/tatami|\d+\s*kg|fille|gar[cç]on|s[eé]nior|cadet|junior|minime/i.test(line) || /finale|demi/i.test(line));
    if (!isFightHeader) {
      i += 1;
      continue;
    }

    const header = line;
    let blanc = null;
    let bleu = null;
    let j = i + 1;
    while (j < lines.length && j < i + 8) {
      const side = parseAthleteSide(lines[j]);
      if (side) {
        if (/^Blanc\s*:/i.test(lines[j])) blanc = side;
        else if (/^Bleu\s*:/i.test(lines[j])) bleu = side;
      }
      if (blanc && bleu) break;
      if (/^Fin du combat/i.test(lines[j])) break;
      if (j > i + 1 && /finale|demi|quart|repechage|poule/i.test(lines[j])
        && /tatami|\d+\s*kg/i.test(lines[j])) break;
      j += 1;
    }

    if (blanc || bleu) {
      fights.push({
        header,
        round: detectRound(header),
        category: parseCategoryFromHeader(header),
        blanc,
        bleu,
      });
    }
    i = Math.max(j, i + 1);
  }

  if (!fights.length) {
    throw new Error('Aucun combat terminé trouvé dans le PDF');
  }

  const map = new Map();
  for (const fight of fights) {
    for (const side of [fight.blanc, fight.bleu]) {
      if (!side) continue;
      const entry = {
        judoka_prenom: side.prenom,
        judoka_nom: side.nom,
        judoka_club: side.club || '',
        judoka_sexe: fight.category.judoka_sexe,
        categorie_age: fight.category.categorie_age,
        categorie_poids: fight.category.categorie_poids,
        place: null,
        wins: 0,
      };
      const key = athleteBucketKey(entry);
      const prev = map.get(key) || entry;
      if (!prev.judoka_club && entry.judoka_club) prev.judoka_club = entry.judoka_club;
      if (side.outcome === 'win') prev.wins += 1;
      prev.place = placeFromOutcome(fight.round, side.outcome, prev.place);
      map.set(key, prev);
    }
  }

  const athletes = [...map.values()].map((a) => ({
    ...a,
    place: a.place == null ? (a.wins > 0 ? 5 : 0) : a.place,
  }));

  return {
    competition_date,
    fights_count: fights.length,
    athletes,
  };
}

/**
 * Extrait les résultats Ranking depuis un PDF "Resultats des combats".
 */
export async function extractRankingResultsFromPdfFile(file, onProgress) {
  if (!file) throw new Error('Aucun fichier sélectionné');
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (!name.endsWith('.pdf') && type !== 'application/pdf') {
    throw new Error('Sélectionnez un fichier PDF');
  }

  const report = (pct) => {
    if (typeof onProgress === 'function') onProgress(Math.max(0, Math.min(100, Math.round(pct))));
  };

  ensurePdfWorker();
  report(5);
  const data = await file.arrayBuffer();
  report(15);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  report(30);

  let text = '';
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item) => String(item.str || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Reconstruct newlines around fight markers for the parser
    text += `${pageText}\n`;
    report(30 + (pageNum / Math.max(doc.numPages, 1)) * 50);
  }

  // pdfjs often flattens to one line - re-insert breaks before known markers
  const normalized = text
    .replace(/\s+(Finale\s+(?:Or|Bronze)|Demi-finale|Quart|Rep[eê]chage|Poule)\b/gi, '\n$1')
    .replace(/\s+(Blanc\s*:)/gi, '\n$1')
    .replace(/\s+(Bleu\s*:)/gi, '\n$1')
    .replace(/\s+(Fin du combat\s*:)/gi, '\n$1')
    .replace(/\s+(Termine|Terminé)\b/gi, '\n$1');

  const parsed = parseCombatResultsText(normalized);
  report(100);
  return parsed;
}
