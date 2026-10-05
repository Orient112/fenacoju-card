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

const HEADER_CLUB = /^(clubs?|nom\s*(du\s*)?club)$/i;
const HEADER_LIGUE = /^(ligues?|league)$/i;
const SKIP_ROW = /^(fenacoju|fédération|federation|compétition|competition|cadre|lieu|date|inscrits?|#)$/i;

function normalizeLigue(value) {
  const ligue = String(value || '').trim();
  if (!ligue || ligue === '—' || ligue === '–' || /^n\/?a$/i.test(ligue)) return '-';
  return ligue;
}

function groupItemsIntoRows(items, yTolerance = 3) {
  const rows = [];
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y;
    return a.x - b.x;
  });

  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - item.y) <= yTolerance) {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows;
}

function detectColumnBounds(headerRow) {
  let clubX = null;
  let ligueX = null;
  for (const item of headerRow.items) {
    const t = item.str.trim();
    if (HEADER_CLUB.test(t) && clubX == null) clubX = item.x;
    if (HEADER_LIGUE.test(t) && ligueX == null) ligueX = item.x;
  }
  if (clubX == null || ligueX == null) return null;
  const mid = (clubX + ligueX) / 2;
  return {
    clubMin: Math.min(clubX, ligueX) - 20,
    split: mid,
    clubIsLeft: clubX < ligueX,
  };
}

function cellsFromRow(row, bounds) {
  const left = [];
  const right = [];
  for (const item of row.items) {
    if (item.x < bounds.split) left.push(item.str);
    else right.push(item.str);
  }
  const leftText = left.join(' ').replace(/\s+/g, ' ').trim();
  const rightText = right.join(' ').replace(/\s+/g, ' ').trim();
  if (bounds.clubIsLeft) {
    return { club: leftText, ligue: rightText };
  }
  return { club: rightText, ligue: leftText };
}

function parsePlainClubLigueLine(line) {
  let text = String(line || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // "Club / Ligue" ou "Club | Ligue" ou "Club\tLigue"
  const splitMatch = text.match(/^(.+?)\s*[|/·•]\s*(.+)$/);
  if (splitMatch) {
    const nom = splitMatch[1].replace(/^\d+[.)\-:]\s*/, '').trim();
    if (!nom || SKIP_ROW.test(nom) || HEADER_CLUB.test(nom)) return null;
    return { nom, ligue: normalizeLigue(splitMatch[2]) };
  }

  // Tabs or multi-spaces as column sep
  const parts = text.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const nom = parts[0].replace(/^\d+[.)\-:]\s*/, '').trim();
    if (!nom || SKIP_ROW.test(nom) || HEADER_CLUB.test(nom) || HEADER_LIGUE.test(nom)) return null;
    return { nom, ligue: normalizeLigue(parts.slice(1).join(' ')) };
  }

  const nom = text.replace(/^\d+[.)\-:]\s*/, '').trim();
  if (nom.length < 2 || nom.length > 80) return null;
  if (SKIP_ROW.test(nom) || HEADER_CLUB.test(nom) || HEADER_LIGUE.test(nom)) return null;
  if (/^[\d\s./-]+$/.test(nom)) return null;
  if (/\b\d+\s*kg\b/i.test(nom)) return null;
  return { nom, ligue: '-' };
}

/**
 * Extrait clubs + ligues depuis un PDF (colonnes Club / Ligue si présentes).
 * @param {File} file
 * @param {(pct: number) => void} [onProgress] 0–100
 * @returns {Promise<Array<{ nom: string, ligue: string }>>}
 */
export async function extractClubsFromPdfFile(file, onProgress) {
  if (!file) throw new Error('Aucun fichier sélectionné');
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (!name.endsWith('.pdf') && type !== 'application/pdf') {
    throw new Error('Sélectionnez un fichier PDF');
  }

  const report = (pct) => {
    if (typeof onProgress === 'function') {
      onProgress(Math.max(0, Math.min(100, Math.round(pct))));
    }
  };

  ensurePdfWorker();
  report(5);
  const data = await file.arrayBuffer();
  report(12);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const totalPages = Math.max(doc.numPages, 1);
  const seen = new Set();
  const clubs = [];
  let bounds = null;
  let usedColumns = false;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items || [])
      .map((item) => {
        const str = String(item.str || '').trim();
        if (!str) return null;
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        return {
          str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
        };
      })
      .filter(Boolean);

    const rows = groupItemsIntoRows(items);

    for (const row of rows) {
      if (!bounds) {
        const detected = detectColumnBounds(row);
        if (detected) {
          bounds = detected;
          usedColumns = true;
          continue;
        }
      }

      if (bounds) {
        const headerAgain = detectColumnBounds(row);
        if (headerAgain) continue;

        const cells = cellsFromRow(row, bounds);
        let nom = cells.club.replace(/^\d+[.)\-:]\s*/, '').trim();
        // Parfois le n° est dans une colonne à gauche du split
        if (!nom && cells.ligue && !HEADER_LIGUE.test(cells.ligue)) {
          // ignorer lignes vides / en-têtes
          continue;
        }
        if (!nom || SKIP_ROW.test(nom) || HEADER_CLUB.test(nom) || HEADER_LIGUE.test(nom)) continue;
        if (/^[\d\s./-]+$/.test(nom)) continue;

        const key = nom.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        clubs.push({ nom, ligue: normalizeLigue(cells.ligue) });
        continue;
      }

      // Fallback sans en-têtes de colonnes
      const parsed = parsePlainClubLigueLine(row.text);
      if (!parsed) continue;
      const key = parsed.nom.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      clubs.push(parsed);
    }

    report(12 + (pageNum / totalPages) * 78);
  }

  report(95);

  if (!clubs.length) {
    throw new Error(
      usedColumns
        ? 'Aucune ligne Club / Ligue détectée dans ce PDF'
        : 'Aucun club détecté dans ce PDF'
    );
  }

  clubs.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  report(100);
  return clubs;
}

/** @deprecated utiliser extractClubsFromPdfFile */
export async function extractClubNamesFromPdfFile(file, onProgress) {
  const clubs = await extractClubsFromPdfFile(file, onProgress);
  return clubs.map((c) => c.nom);
}
