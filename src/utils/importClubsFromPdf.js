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

async function yieldUi() {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
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

  const splitMatch = text.match(/^(.+?)\s*[|/·•]\s*(.+)$/);
  if (splitMatch) {
    const nom = splitMatch[1].replace(/^\d+[.)\-:]\s*/, '').trim();
    if (!nom || SKIP_ROW.test(nom) || HEADER_CLUB.test(nom)) return null;
    return { nom, ligue: normalizeLigue(splitMatch[2]) };
  }

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
 * Extrait clubs + ligues depuis un PDF.
 * Progression réelle : lecture → pages → lignes → finalisation (0–100).
 */
export async function extractClubsFromPdfFile(file, onProgress) {
  if (!file) throw new Error('Aucun fichier sélectionné');
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (!name.endsWith('.pdf') && type !== 'application/pdf') {
    throw new Error('Sélectionnez un fichier PDF');
  }

  let lastReported = -1;
  const report = async (pct) => {
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    if (next === lastReported) return;
    lastReported = next;
    if (typeof onProgress === 'function') onProgress(next);
    await yieldUi();
  };

  ensurePdfWorker();
  await report(1);

  const data = await file.arrayBuffer();
  await report(4);

  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  await report(8);

  const totalPages = Math.max(doc.numPages, 1);
  const seen = new Set();
  const clubs = [];
  let bounds = null;
  let usedColumns = false;

  // Plage parsing pages : 8% → 85%
  const parseStart = 8;
  const parseEnd = 85;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const pageBase = parseStart + ((pageNum - 1) / totalPages) * (parseEnd - parseStart);
    const pageSpan = (parseEnd - parseStart) / totalPages;

    await report(pageBase + pageSpan * 0.05);
    const page = await doc.getPage(pageNum);
    await report(pageBase + pageSpan * 0.2);

    const content = await page.getTextContent();
    await report(pageBase + pageSpan * 0.35);

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
    const rowCount = Math.max(rows.length, 1);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];

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
        const nom = cells.club.replace(/^\d+[.)\-:]\s*/, '').trim();
        if (!nom || SKIP_ROW.test(nom) || HEADER_CLUB.test(nom) || HEADER_LIGUE.test(nom)) continue;
        if (/^[\d\s./-]+$/.test(nom)) continue;

        const key = nom.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          clubs.push({ nom, ligue: normalizeLigue(cells.ligue) });
        }
      } else {
        const parsed = parsePlainClubLigueLine(row.text);
        if (!parsed) continue;
        const key = parsed.nom.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          clubs.push(parsed);
        }
      }

      // Progression ligne par ligne (état réel)
      if (rowIndex % 3 === 0 || rowIndex === rows.length - 1) {
        const rowPct = (rowIndex + 1) / rowCount;
        await report(pageBase + pageSpan * (0.35 + rowPct * 0.65));
      }
    }

    await report(pageBase + pageSpan);
  }

  await report(90);

  if (!clubs.length) {
    throw new Error(
      usedColumns
        ? 'Aucune ligne Club / Ligue détectée dans ce PDF'
        : 'Aucun club détecté dans ce PDF'
    );
  }

  clubs.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  await report(95);
  return clubs;
}

/** @deprecated utiliser extractClubsFromPdfFile */
export async function extractClubNamesFromPdfFile(file, onProgress) {
  const clubs = await extractClubsFromPdfFile(file, onProgress);
  return clubs.map((c) => c.nom);
}
