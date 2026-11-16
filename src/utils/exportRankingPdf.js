import { jsPDF } from 'jspdf';

function clip(pdf, text, maxWidth) {
  const value = String(text ?? '');
  if (!value) return '-';
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && pdf.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

export function exportRankingBoardToPdf(board = [], meta = {}) {
  if (!board.length) throw new Error('Aucun classement à exporter');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginX = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const headers = ['#', 'Athlète', 'Sexe', 'Club', 'Âge', 'Poids', 'Or', 'Victoires', 'Points'];
  const colW = [12, 55, 16, 50, 28, 28, 18, 24, 24];
  const rowH = 7;
  let y = 16;

  const filters = [
    meta.season_label || null,
    meta.sexe === 'F' ? 'Féminin' : meta.sexe === 'M' ? 'Masculin' : 'Tous sexes',
    meta.categorie_age || null,
    meta.categorie_poids || 'Toutes catégories',
  ].filter(Boolean).join(' · ');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Ranking national', marginX, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(filters || 'Classement', marginX, y);
  y += 5;
  pdf.text(`${board.length} athlète${board.length > 1 ? 's' : ''} · ${new Date().toLocaleDateString('fr-FR')}`, marginX, y);
  y += 8;

  const drawHeader = () => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(marginX, y - 4.5, usableWidth, rowH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    let x = marginX + 1.2;
    headers.forEach((h, i) => {
      pdf.text(h, x, y);
      x += colW[i];
    });
    y += rowH;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'normal');
  };

  drawHeader();

  board.forEach((row, idx) => {
    if (y > pageHeight - 12) {
      pdf.addPage('a4', 'landscape');
      y = 16;
      drawHeader();
    }
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, y - 4.5, usableWidth, rowH, 'F');
    }
    const values = [
      row.rank,
      `${row.prenom || ''} ${row.nom || ''}`.trim(),
      row.sexe === 'F' ? 'F' : 'M',
      row.club || '-',
      row.categorie_age || '-',
      row.categorie_poids || '-',
      row.gold_medals || 0,
      row.wins || 0,
      row.points || 0,
    ];
    pdf.setFontSize(8);
    let x = marginX + 1.2;
    values.forEach((value, i) => {
      pdf.text(clip(pdf, value, colW[i] - 2), x, y);
      x += colW[i];
    });
    y += rowH;
  });

  const stamp = new Date().toISOString().split('T')[0];
  pdf.save(`ranking-${stamp}.pdf`);
}
