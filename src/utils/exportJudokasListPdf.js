import { jsPDF } from 'jspdf';

function clip(pdf, text, maxWidth) {
  const value = String(text || '');
  if (!value) return '—';
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && pdf.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

export function exportJudokasListToPdf(judokas = []) {
  if (!judokas.length) throw new Error('Aucun judoka à exporter');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginX = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  let y = 16;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(29, 67, 147);
  pdf.text('FENACOJU · Liste des Judokas', marginX, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`${judokas.length} judoka${judokas.length > 1 ? 's' : ''}  ·  ${new Date().toLocaleDateString('fr-FR')}`, marginX, y);
  y += 8;

  const headers = ['N° carte', 'Nom', 'Prénom', 'Club', 'Grade', 'Catégorie', 'Sexe', 'Inscription', 'Statut'];
  const colW = [32, 32, 32, 48, 28, 28, 16, 28, 22];
  const rowH = 7;

  const drawHeader = () => {
    pdf.setFillColor(29, 67, 147);
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

  judokas.forEach((j, idx) => {
    if (y > pageHeight - 12) {
      pdf.addPage('a4', 'landscape');
      y = 16;
      drawHeader();
    }
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, y - 4.5, usableWidth, rowH, 'F');
    }
    const cells = [
      j.numero_carte,
      j.nom,
      j.prenom,
      j.club,
      j.grade,
      j.categorie,
      j.sexe === 'F' ? 'F' : 'M',
      j.date_inscription,
      j.statut === 'actif' ? 'Actif' : (j.statut || '—'),
    ];
    pdf.setFontSize(8);
    let x = marginX + 1.2;
    cells.forEach((value, i) => {
      pdf.text(clip(pdf, value, colW[i] - 2), x, y);
      x += colW[i];
    });
    y += rowH;
  });

  pdf.save(`fenacoju-liste-judokas-${new Date().toISOString().split('T')[0]}.pdf`);
}
