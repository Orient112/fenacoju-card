import { jsPDF } from 'jspdf';

const ROUND1_COLORS = [
  [227, 6, 19],
  [234, 179, 8],
  [22, 163, 74],
  [37, 99, 235],
  [147, 51, 234],
  [236, 72, 153],
  [146, 64, 14],
  [249, 115, 22],
];

const LATER_COLORS = [
  [249, 115, 22],
  [234, 179, 8],
  [22, 163, 74],
  [37, 99, 235],
  [147, 51, 234],
  [236, 72, 153],
  [146, 64, 14],
  [227, 6, 19],
];

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

function fighterLabel(f) {
  if (!f) return 'Exempt';
  return f.label || `${f.prenom || ''} ${f.nom || ''}`.trim() || 'Exempt';
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function collectFighters(group) {
  // Positionnement aléatoire dans la grille (y compris exempt)
  if (group.seedOrder?.length) {
    return shuffle(group.seedOrder.map((f) => ({
      label: f.label || `${f.prenom || ''} ${f.nom || ''}`.trim(),
      club: f.club || '',
    })));
  }

  const list = [];
  for (const fight of group.fights || []) {
    list.push({ label: fight.labelA, club: fight.a?.club || '' });
    list.push({ label: fight.labelB, club: fight.b?.club || '' });
  }
  if (group.bye) {
    list.push({ label: group.bye.label, club: group.bye.club || '' });
  }
  return shuffle(list);
}

function clipText(pdf, text, maxWidth) {
  const value = String(text || '');
  if (!value) return '';
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && pdf.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function drawBracketPage(pdf, group, competition, modeLabel) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const fighters = collectFighters(group);
  const size = nextPowerOf2(fighters.length || 2);
  const slots = [...fighters];
  while (slots.length < size) slots.push(null);
  const rounds = Math.log2(size); // number of rounds until winner

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(29, 67, 147);
  pdf.text(competition.nom || 'Compétition FENACOJU', 10, 11);

  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Grille de Combat · ${modeLabel || ''} · ${group.title || ''}`, 10, 17);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  const meta = [
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `${fighters.length} judoka${fighters.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join('  ·  ');
  if (meta) pdf.text(meta, 10, 22);
  pdf.setTextColor(15, 23, 42);

  const top = 28;
  const bottom = pageHeight - 10;
  const left = 10;
  const usableHeight = bottom - top;
  const slotH = usableHeight / size;
  const nameW = Math.min(48, pageWidth * 0.16);
  const combatW = 20;
  const roundCols = rounds; // columns after names for each round outcome
  const remainW = pageWidth - left - nameW - combatW - 8 - 36;
  const colW = remainW / Math.max(roundCols, 1);

  const yAt = (index) => top + (index + 0.5) * slotH;

  // Round 1: names + colored Combat boxes
  for (let i = 0; i < size; i += 2) {
    const matchIndex = i / 2;
    const color = ROUND1_COLORS[matchIndex % ROUND1_COLORS.length];
    const y1 = yAt(i);
    const y2 = yAt(i + 1);
    const boxH = Math.min(6.8, slotH * 0.5);
    const midY = (y1 + y2) / 2;

    pdf.setDrawColor(170, 170, 170);
    pdf.setFillColor(255, 255, 255);
    pdf.setLineWidth(0.25);

    pdf.rect(left, y1 - boxH / 2, nameW, boxH, 'FD');
    pdf.rect(left, y2 - boxH / 2, nameW, boxH, 'FD');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(clipText(pdf, fighterLabel(slots[i]), nameW - 2.5), left + 1.2, y1 + 1);
    pdf.text(clipText(pdf, fighterLabel(slots[i + 1]), nameW - 2.5), left + 1.2, y2 + 1);

    const cx = left + nameW + 1.5;
    const cH = Math.max(y2 - y1 + boxH * 0.2, boxH * 1.6);
    pdf.setFillColor(...color);
    pdf.rect(cx, midY - cH / 2, combatW, cH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(`Combat ${matchIndex + 1}`, cx + combatW / 2, midY + 1, { align: 'center' });

    pdf.setDrawColor(110, 110, 110);
    pdf.setLineWidth(0.3);
    pdf.line(left + nameW, y1, cx, y1);
    pdf.line(left + nameW, y2, cx, y2);
  }

  // Subsequent rounds + connectors
  let nextCombatNo = size / 2 + 1;
  const roundAnchorX = [];

  for (let r = 0; r < rounds; r++) {
    const matches = size / (2 ** (r + 1));
    const span = 2 ** (r + 1);
    const colX = left + nameW + combatW + 4 + r * colW;
    roundAnchorX[r] = colX;
    const boxW = Math.min(14, colW * 0.4);
    const boxH = Math.min(7, slotH * (2 ** r) * 0.28);

    for (let m = 0; m < matches; m++) {
      const start = m * span;
      const yTop = yAt(start);
      const yBot = yAt(start + span - 1);
      const yMid = (yTop + yBot) / 2;
      const color = LATER_COLORS[m % LATER_COLORS.length];

      pdf.setDrawColor(110, 110, 110);
      pdf.setLineWidth(0.35);

      if (r === 0) {
        const fromX = left + nameW + combatW + 1.5;
        pdf.line(fromX, yTop, colX, yTop);
        pdf.line(fromX, yBot, colX, yBot);
      } else {
        const prevX = roundAnchorX[r - 1] + Math.min(14, colW * 0.4);
        pdf.line(prevX, yTop, colX, yTop);
        pdf.line(prevX, yBot, colX, yBot);
      }

      pdf.line(colX, yTop, colX, yBot);
      pdf.line(colX, yMid, colX + boxW, yMid);

      // Label C9, C10... (skip drawing for visual of first round combat already named)
      const label = `C${nextCombatNo}`;
      nextCombatNo += 1;

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(170, 170, 170);
      pdf.rect(colX + 0.8, yMid - boxH / 2, boxW, boxH, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...color);
      pdf.text(label, colX + 0.8 + boxW / 2, yMid + 1.1, { align: 'center' });
      pdf.setTextColor(15, 23, 42);
    }
  }

  // Winner
  const lastCol = roundAnchorX[rounds - 1] + Math.min(14, colW * 0.4);
  const winnerY = (yAt(0) + yAt(size - 1)) / 2;
  const winnerBoxX = pageWidth - 40;
  pdf.setDrawColor(110, 110, 110);
  pdf.line(lastCol, winnerY, winnerBoxX, winnerY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(29, 67, 147);
  pdf.text('Vainqueur', winnerBoxX, winnerY - 2);
  pdf.setDrawColor(170, 170, 170);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(winnerBoxX, winnerY + 0.5, 28, 6.5, 'FD');
}

export function exportCompetitionDrawToPdf(drawResult, competition = {}) {
  if (!drawResult?.groups?.length) {
    throw new Error('Aucune grille de combat à exporter');
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let first = true;

  drawResult.groups.forEach((group) => {
    if (!collectFighters(group).length) return;
    if (!first) pdf.addPage('a4', 'landscape');
    first = false;
    drawBracketPage(pdf, group, competition, drawResult.modeLabel);
  });

  if (first) {
    throw new Error('Aucune grille de combat à exporter');
  }

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const modeSlug = (drawResult.mode || 'tirage').replace(/[^a-z0-9]+/gi, '-');
  pdf.save(`fenacoju-grille-${modeSlug}-${slug || 'combat'}-${new Date().toISOString().split('T')[0]}.pdf`);
}
