import { jsPDF } from 'jspdf';
import { sortRegistrationsByGenderAndWeight } from './competitionDraw';

function fullName(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || '—';
}

function genderSectionTitle(sexe) {
  return sexe === 'F' ? 'Filles' : 'Garçons';
}

function clubName(r) {
  return (r.club || '').trim() || 'Sans club';
}

function roleLabel(r) {
  const role = String(r?.role_equipe || r?.taille || '').toLowerCase();
  if (role.includes('remplac')) return 'Remplaçant';
  if (String(r?.categorie || '').toLowerCase().includes('rempl')) return 'Remplaçant';
  return 'Principal';
}

function groupByClub(list) {
  const map = new Map();
  for (const r of list || []) {
    const club = clubName(r);
    if (!map.has(club)) map.set(club, []);
    map.get(club).push(r);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}

function exportTeamListToPdf(registrations, competition = {}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const headers = ['#', 'Nom', 'Catégorie', 'Rôle', 'Poids'];
  const colWidths = [12, 70, 36, 36, 28];
  const rowHeight = 7;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(competition.nom || 'Compétition FENACOJU', marginX, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const meta = [
    'Cadre : Par équipe',
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `Inscrits : ${registrations.length}`,
  ].filter(Boolean);
  pdf.text(meta.join('  ·  '), marginX, y);
  y += 10;

  const ensureSpace = (needed = 16) => {
    if (y > pageHeight - needed) {
      pdf.addPage();
      y = 18;
      return true;
    }
    return false;
  };

  const drawTableHeader = () => {
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

  const drawGenderTitle = (title) => {
    ensureSpace(20);
    pdf.setFillColor(29, 67, 147);
    pdf.rect(marginX, y - 4.5, usableWidth, rowHeight + 2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(title, marginX + 2, y);
    y += rowHeight + 4;
    pdf.setTextColor(15, 23, 42);
  };

  const drawClubTitle = (title, count) => {
    ensureSpace(22);
    pdf.setFillColor(226, 232, 240);
    pdf.rect(marginX, y - 4.5, usableWidth, rowHeight + 1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(29, 67, 147);
    pdf.text(`${title}  ·  ${count} judoka${count > 1 ? 's' : ''}`, marginX + 2, y);
    y += rowHeight + 2;
    pdf.setTextColor(15, 23, 42);
    drawTableHeader();
  };

  const sections = [
    { title: 'Garçons', list: registrations.filter((r) => r.sexe !== 'F') },
    { title: 'Filles', list: registrations.filter((r) => r.sexe === 'F') },
  ];

  sections.forEach((section) => {
    if (!section.list.length) return;
    drawGenderTitle(section.title);
    groupByClub(section.list).forEach(([club, members]) => {
      const sorted = [...members].sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));
      drawClubTitle(club, sorted.length);
      sorted.forEach((r, idx) => {
        ensureSpace(12);
        if (y > pageHeight - 16) {
          pdf.addPage();
          y = 18;
          drawClubTitle(club, sorted.length);
        }
        if (idx % 2 === 0) {
          pdf.setFillColor(241, 245, 249);
          pdf.rect(marginX, y - 4.5, usableWidth, rowHeight, 'F');
        }
        const row = [
          String(idx + 1),
          fullName(r),
          r.categorie || '—',
          roleLabel(r),
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
      });
      y += 4;
    });
    y += 4;
  });

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  pdf.save(`fenacoju-inscrits-equipe-${slug || 'liste'}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportCompetitionListToPdf(registrations, competition = {}) {
  if (!registrations?.length) {
    throw new Error('Aucun inscrit à exporter');
  }

  if (competition.cadre === 'Par équipe') {
    exportTeamListToPdf(registrations, competition);
    return;
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
