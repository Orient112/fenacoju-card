import { jsPDF } from 'jspdf';

const STATUT_LABELS = {
  pending: 'En attente',
  actif: 'Actif',
  rejete: 'Rejeté',
};

function clip(pdf, text, maxWidth) {
  const value = String(text ?? '');
  if (!value) return '—';
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && pdf.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function statutLabel(value) {
  return STATUT_LABELS[value] || value || '—';
}

function displayEmail(email) {
  if (!email || String(email).endsWith('@fiche.local')) return '—';
  return email;
}

function orgName(u) {
  return u.nom_organisation || u.nom || u.nom_club || '—';
}

function personName(u) {
  return `${u.prenom || ''} ${u.nom || ''}`.trim() || '—';
}

const TAB_CONFIG = {
  judokas: {
    title: 'Liste des Judokas',
    filename: 'fenacoju-liste-judokas',
    headers: ['N° carte', 'Nom', 'Prénom', 'Club', 'Grade', 'Catégorie', 'Sexe', 'Inscription', 'Statut'],
    colW: [32, 32, 32, 48, 28, 28, 16, 28, 22],
    row: (j) => [
      j.numero_carte,
      j.nom,
      j.prenom,
      j.club,
      j.grade,
      j.categorie,
      j.sexe === 'F' ? 'F' : 'M',
      j.date_inscription,
      j.statut === 'actif' ? 'Actif' : (j.statut || '—'),
    ],
  },
  ligues: {
    title: 'Liste des Ligues',
    filename: 'fenacoju-liste-ligues',
    headers: ['Ligue', 'Responsable', 'Ville', 'Email', 'Téléphone', 'Statut'],
    colW: [58, 48, 36, 62, 36, 28],
    row: (u) => [orgName(u), u.responsable, u.ville, displayEmail(u.email), u.telephone, statutLabel(u.statut)],
  },
  ententes: {
    title: 'Liste des Ententes',
    filename: 'fenacoju-liste-ententes',
    headers: ['Entente', 'Responsable', 'Ville', 'Email', 'Téléphone', 'Statut'],
    colW: [58, 48, 36, 62, 36, 28],
    row: (u) => [orgName(u), u.responsable, u.ville, displayEmail(u.email), u.telephone, statutLabel(u.statut)],
  },
  clubs: {
    title: 'Liste des Clubs',
    filename: 'fenacoju-liste-clubs',
    headers: ['Club', 'Responsable', 'Ville', 'Email', 'Téléphone', 'Statut'],
    colW: [58, 48, 36, 62, 36, 28],
    row: (u) => [u.nom_club || orgName(u), u.responsable, u.ville, displayEmail(u.email), u.telephone, statutLabel(u.statut)],
  },
  entraineurs: {
    title: 'Liste des Entraineurs',
    filename: 'fenacoju-liste-entraineurs',
    headers: ['Nom', 'Prénom', 'Club', 'Email', 'Téléphone', 'Statut'],
    colW: [42, 42, 52, 70, 36, 26],
    row: (u) => [u.nom, u.prenom, u.club || u.nom_club, displayEmail(u.email), u.telephone, statutLabel(u.statut)],
  },
  arbitres: {
    title: 'Liste des Arbitres',
    filename: 'fenacoju-liste-arbitres',
    headers: ['Nom', 'Prénom', 'Niveau', 'Club', 'Grade', 'Téléphone'],
    colW: [42, 42, 42, 58, 36, 48],
    row: (a) => [a.nom, a.prenom, a.niveau, a.club, a.grade, a.telephone],
  },
  federation: {
    title: 'Liste des Membres',
    filename: 'fenacoju-liste-membres',
    headers: ['Nom', 'Prénom', 'Fonction / Rôle', 'Email', 'Téléphone'],
    colW: [46, 46, 62, 80, 34],
    row: (u) => [u.nom, u.prenom, u.fonction || 'Membre', displayEmail(u.email), u.telephone],
  },
};

export function exportDashboardListToPdf(tab, rows = []) {
  const config = TAB_CONFIG[tab] || TAB_CONFIG.judokas;
  if (!rows.length) throw new Error('Aucune donnée à exporter');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const marginX = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const rowH = 7;
  let y = 16;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(29, 67, 147);
  pdf.text(`FENACOJU · ${config.title}`, marginX, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`${rows.length} enregistrement${rows.length > 1 ? 's' : ''}  ·  ${new Date().toLocaleDateString('fr-FR')}`, marginX, y);
  y += 8;

  const drawHeader = () => {
    pdf.setFillColor(29, 67, 147);
    pdf.rect(marginX, y - 4.5, usableWidth, rowH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    let x = marginX + 1.2;
    config.headers.forEach((h, i) => {
      pdf.text(h, x, y);
      x += config.colW[i];
    });
    y += rowH;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'normal');
  };

  drawHeader();

  rows.forEach((item, idx) => {
    if (y > pageHeight - 12) {
      pdf.addPage('a4', 'landscape');
      y = 16;
      drawHeader();
    }
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, y - 4.5, usableWidth, rowH, 'F');
    }
    pdf.setFontSize(8);
    let x = marginX + 1.2;
    config.row(item).forEach((value, i) => {
      pdf.text(clip(pdf, value, config.colW[i] - 2), x, y);
      x += config.colW[i];
    });
    y += rowH;
  });

  pdf.save(`${config.filename}-${new Date().toISOString().split('T')[0]}.pdf`);
}
