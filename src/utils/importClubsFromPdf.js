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

const SKIP_LINE = /^(fenacoju|fédération|federation|compétition|competition|cadre|lieu|date|inscrits?|garçons?|garcons?|filles?|individuel|par équipe|par equipe|nom|prénom|prenom|club|catégorie|categorie|poids|rôle|role|sexe|page\s*\d+|téléphone|telephone|#)$/i;

/**
 * Extrait le texte brut d'un fichier PDF (navigateur).
 */
export async function extractPdfText(file) {
  ensurePdfWorker();
  const data = await file.arrayBuffer();
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines = [];
    for (const item of content.items || []) {
      const str = String(item?.str || '').trim();
      if (!str) {
        if (item?.hasEOL && line) {
          lines.push(line.trim());
          line = '';
        }
        continue;
      }
      line = line ? `${line} ${str}` : str;
      if (item?.hasEOL) {
        lines.push(line.trim());
        line = '';
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join('\n'));
  }

  return pages.join('\n');
}

/**
 * Déduit une liste de noms de clubs depuis le texte d'un PDF liste.
 * Accepte : une ligne = un club, ou titres style "Club X · N judoka(s)".
 */
export function parseClubNamesFromPdfText(text) {
  const raw = String(text || '').replace(/\r/g, '\n');
  const seen = new Set();
  const clubs = [];

  for (const dirty of raw.split('\n')) {
    let line = dirty.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    // Titres export liste : "JC Kalamu  ·  3 judokas"
    const clubTitle = line.match(/^(.+?)\s*[·•|-]\s*\d+\s*judoka/i);
    if (clubTitle) {
      line = clubTitle[1].trim();
    }

    // Lignes numérotées : "1. Club XYZ" / "1) Club XYZ" / "1 - Club"
    line = line.replace(/^\d+[.)\-:]\s*/, '').trim();

    // Retirer préfixe "Club :"
    line = line.replace(/^clubs?\s*[:：-]\s*/i, '').trim();

    if (line.length < 2 || line.length > 80) continue;
    if (SKIP_LINE.test(line)) continue;
    if (/^[\d\s./-]+$/.test(line)) continue;
    if (/inscrits?\s*:/i.test(line)) continue;
    if (/cadre\s*:/i.test(line)) continue;
    if (/lieu\s*:/i.test(line)) continue;
    if (/date\s*:/i.test(line)) continue;
    if (/compétition|competition/i.test(line) && line.length > 40) continue;
    // Lignes de tableau judoka (souvent prénom+nom + catégorie)
    if (/\b\d+\s*kg\b/i.test(line)) continue;
    if (/\b(principal|remplaçant|remplacant)\b/i.test(line)) continue;

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clubs.push(line);
  }

  return clubs.sort((a, b) => a.localeCompare(b, 'fr'));
}

export async function extractClubNamesFromPdfFile(file) {
  if (!file) throw new Error('Aucun fichier sélectionné');
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (!name.endsWith('.pdf') && type !== 'application/pdf') {
    throw new Error('Sélectionnez un fichier PDF');
  }
  const text = await extractPdfText(file);
  const clubs = parseClubNamesFromPdfText(text);
  if (!clubs.length) {
    throw new Error('Aucun nom de club détecté dans ce PDF');
  }
  return clubs;
}
