import { jsPDF } from 'jspdf';

function fullName(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || '—';
}

export function exportCompetitionListToPdf(registrations, competition = {}) {
  if (!registrations?.length) {
    throw new Error('Aucun inscrit à exporter');
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(competition.nom || 'Compétition FENACOJU', marginX, y);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const meta = [
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `Inscrits : ${registrations.length}`,
    `Export : ${new Date().toLocaleString('fr-FR')}`,
  ].filter(Boolean);
  pdf.text(meta.join('  ·  '), marginX, y);
  y += 10;

  const headers = ['#', 'Nom', 'Club', 'N° carte', 'Catégorie', 'Sexe', 'Poids'];
  const colWidths = [10, 45, 40, 28, 28, 14, 18];
  const rowHeight = 7;

  const drawHeader = () => {
    pdf.setFillColor(29, 67, 147);
    pdf.rect(marginX, y - 4.5, usableWidth, rowHeight, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    let x = marginX + 1;
    headers.forEach((h, i) => {
      pdf.text(h, x, y);
      x += colWidths[i];
    });
    y += rowHeight;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'normal');
  };

  drawHeader();

  registrations.forEach((r, idx) => {
    if (y > pageHeight - 18) {
      pdf.addPage();
      y = 18;
      drawHeader();
    }

    if (idx % 2 === 0) {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(marginX, y - 4.5, usableWidth, rowHeight, 'F');
    }

    const row = [
      String(idx + 1),
      fullName(r),
      r.club || '—',
      r.numero_carte || '—',
      r.categorie || '—',
      r.sexe || '—',
      r.poids ? `${r.poids} kg` : '—',
    ];

    let x = marginX + 1;
    row.forEach((cell, i) => {
      const text = pdf.splitTextToSize(String(cell), colWidths[i] - 2)[0] || '';
      pdf.text(text, x, y);
      x += colWidths[i];
    });
    y += rowHeight;
  });

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  pdf.save(`fenacoju-inscrits-${slug || 'liste'}-${new Date().toISOString().split('T')[0]}.pdf`);
}
