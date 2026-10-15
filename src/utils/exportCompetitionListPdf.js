import { jsPDF } from 'jspdf';
import { findCategoryForWeight, parseCategoriesPoids } from './weightCategories';

function fullName(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || '—';
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

function weightSortValue(poids) {
  const n = Number(String(poids ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Tri Par équipe dans un club : catégories de poids croissantes, puis Principal, puis nom. */
function sortTeamMembersByWeightCategory(members, categoriesPoids) {
  const cats = parseCategoriesPoids(categoriesPoids);
  const rank = (r) => {
    const sexe = r.sexe === 'F' ? 'F' : 'M';
    const byWeight = cats.length ? findCategoryForWeight(cats, r.poids, sexe) : null;
    if (byWeight) return { max: byWeight.max, min: byWeight.min, label: byWeight.label };
    const label = String(r.categorie || '').trim();
    const byLabel = label
      ? cats.find((c) => c.sexe === sexe && String(c.label).trim() === label)
      : null;
    if (byLabel) return { max: byLabel.max, min: byLabel.min, label: byLabel.label };
    const w = weightSortValue(r.poids);
    return { max: w, min: w, label };
  };
  return [...(members || [])].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.max !== rb.max) return ra.max - rb.max;
    if (ra.min !== rb.min) return ra.min - rb.min;
    const roleA = roleLabel(a) === 'Remplaçant' ? 1 : 0;
    const roleB = roleLabel(b) === 'Remplaçant' ? 1 : 0;
    if (roleA !== roleB) return roleA - roleB;
    return fullName(a).localeCompare(fullName(b), 'fr');
  });
}

function groupByClub(list, { requireMembers = true } = {}) {
  const map = new Map();
  for (const r of list || []) {
    const club = clubName(r);
    if (!map.has(club)) map.set(club, []);
    map.get(club).push(r);
  }
  return [...map.entries()]
    .filter(([, members]) => (requireMembers ? members.length >= 1 : true))
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'));
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
  const clubsCount = groupByClub(registrations, { requireMembers: true }).length;
  const meta = [
    'Cadre : Par équipe',
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `Clubs : ${clubsCount}`,
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
    const clubs = groupByClub(section.list, { requireMembers: true });
    if (!clubs.length) return;
    drawGenderTitle(section.title);
    clubs.forEach(([club, members]) => {
      const sorted = sortTeamMembersByWeightCategory(members, competition.categories_poids);
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

/**
 * Export PDF des clubs Individuel et de leurs judokas.
 * N’inclut que les clubs ayant au moins 1 judoka inscrit.
 * @param {object} [options]
 * @param {string} [options.clubName] — si défini, n’exporte que ce club
 */
export function exportCompetitionClubsIndividuelPdf(registrations, competition = {}, options = {}) {
  const filterClub = String(options.clubName || '').trim().toLowerCase();
  let list = (registrations || []).filter((r) => {
    const isTeam = r?.mode_inscription === 'equipe'
      || String(r?.taille || '').startsWith('__mode_equipe__');
    return !isTeam;
  });
  if (filterClub) {
    list = list.filter((r) => String(r.club || '').trim().toLowerCase() === filterClub);
  }

  const clubs = groupByClub(list, { requireMembers: true });
  if (!clubs.length) {
    throw new Error(
      filterClub
        ? 'Ce club n’a aucun judoka inscrit à exporter'
        : 'Aucun club avec au moins un judoka inscrit à exporter',
    );
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const headers = ['#', 'Nom', 'Catégorie', 'Sexe', 'Poids', 'N° carte'];
  const colWidths = [12, 62, 32, 18, 24, 34];
  const rowHeight = 7;
  const totalJudokas = clubs.reduce((sum, [, members]) => sum + members.length, 0);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(competition.nom || 'Compétition FENACOJU', marginX, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const meta = [
    'Cadre : Individuel · Clubs',
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `Clubs : ${clubs.length}`,
    `Inscrits : ${totalJudokas}`,
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

  clubs.forEach(([club, members]) => {
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
        r.sexe === 'F' ? 'F' : 'M',
        r.poids ? `${r.poids} kg` : '—',
        r.numero_carte || '—',
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
    y += 5;
  });

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const clubSlug = filterClub
    ? `-${filterClub.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24)}`
    : '';
  pdf.save(
    `fenacoju-clubs-individuel${clubSlug}-${slug || 'liste'}-${new Date().toISOString().split('T')[0]}.pdf`,
  );
}

export function exportCompetitionListToPdf(registrations, competition = {}) {
  if (!registrations?.length) {
    throw new Error('Aucun inscrit à exporter');
  }

  if (competition.cadre === 'Par équipe') {
    // Clubs sans aucun judoka exclus (groupByClub requireMembers)
    // Dans chaque club : tri par catégories de poids
    exportTeamListToPdf(registrations, competition);
    return;
  }

  // Individuel : liste classée par club
  exportCompetitionClubsIndividuelPdf(registrations, competition);
}
