import { jsPDF } from 'jspdf';
import { sortRegistrationsByGenderAndWeight } from './competitionDraw';

function fullName(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || '—';
}

function genderSectionTitle(sexe) {
  return sexe === 'F' ? 'Filles' : 'Garçons';
}

export function exportCompetitionListToPdf(registrations, competition = {}) {
  if (!registrations?.length) {
    throw new Error('Aucun inscrit à exporter');
  }

  const sorted = sortRegistrationsByGenderAndWeight(registrations);
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
    `Inscrits : ${sorted.length}`,
    'Classement : poids · Garçons / Filles',
    `Export : ${new Date().toLocaleString('fr-FR')}`,
  ].filter(Boolean);
  pdf.text(meta.join('  ·  '), marginX, y);
  y += 10;

  const headers = ['#', 'Nom', 'Club', 'N° carte', 'Catégorie', 'Sexe', 'Poids'];
  const colWidths = [10, 45, 40, 28, 28, 14, 18];
  const rowHeight = 7;

  const ensureSpace = (needed = 14) => {
    if (y > pageHeight - needed) {
      pdf.addPage();
      y = 18;
      return true;
    }
    return false;
  };

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

  const drawSectionTitle = (title) => {
    ensureSpace(16);
    pdf.setFillColor(226, 232, 240);
    pdf.rect(marginX, y - 4.5, usableWidth, rowHeight + 1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(29, 67, 147);
    pdf.text(title, marginX + 2, y);
    y += rowHeight + 2;
    pdf.setTextColor(15, 23, 42);
    drawHeader();
  };

  let currentGender = null;
  let indexInSection = 0;

  sorted.forEach((r) => {
    const sexe = r.sexe === 'F' ? 'F' : 'M';
    if (sexe !== currentGender) {
      currentGender = sexe;
      indexInSection = 0;
      drawSectionTitle(genderSectionTitle(sexe));
    }

    ensureSpace(12);
    if (y > pageHeight - 18) {
      pdf.addPage();
      y = 18;
      drawSectionTitle(genderSectionTitle(sexe));
    }

    if (indexInSection % 2 === 0) {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(marginX, y - 4.5, usableWidth, rowHeight, 'F');
    }

    const row = [
      String(indexInSection + 1),
      fullName(r),
      r.club || '—',
      r.numero_carte || '—',
      r.categorie || '—',
      sexe === 'F' ? 'F' : 'M',
      r.poids ? `${r.poids} kg` : '—',
    ];

    let x = marginX + 1;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    row.forEach((cell, i) => {
      const text = pdf.splitTextToSize(String(cell), colWidths[i] - 2)[0] || '';
      pdf.text(text, x, y);
      x += colWidths[i];
    });
    y += rowHeight;
    indexInSection += 1;
  });

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  pdf.save(`fenacoju-inscrits-${slug || 'liste'}-${new Date().toISOString().split('T')[0]}.pdf`);
}
