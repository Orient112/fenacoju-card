import { jsPDF } from 'jspdf';

function fullName(r) {
  return `${r.prenom || ''} ${r.nom || ''}`.trim() || 'Judoka';
}

function clip(pdf, text, maxWidth) {
  const value = String(text || '—');
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && pdf.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function roleLabel(r) {
  const role = String(r?.role_equipe || r?.taille || '').toLowerCase();
  if (role.includes('remplac')) return 'Remplaçant';
  return 'Principal';
}

export function exportCompetitionBadgesToPdf(registrations, competition = {}, cadre = 'individuel') {
  if (!registrations?.length) {
    throw new Error('Aucun judoka à imprimer');
  }

  const isTeam = cadre === 'equipe';
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  registrations.forEach((r, index) => {
    if (index > 0) pdf.addPage('a6', 'portrait');

    pdf.setFillColor(18, 45, 102);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.setFillColor(29, 67, 147);
    pdf.rect(5, 5, pageW - 10, pageH - 10, 'F');
    pdf.setFillColor(245, 197, 24);
    pdf.rect(5, 5, pageW - 10, 3, 'F');
    pdf.rect(5, pageH - 8, pageW - 10, 3, 'F');

    pdf.setTextColor(245, 197, 24);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('FENACOJU', pageW / 2, 16, { align: 'center' });

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Fédération Nationale Congolaise de Judo', pageW / 2, 21, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(clip(pdf, competition.nom || 'Compétition', pageW - 18), pageW / 2, 30, { align: 'center' });

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(12, 36, pageW - 24, 18, 2, 2, 'F');
    pdf.setTextColor(29, 67, 147);
    pdf.setFontSize(8);
    pdf.text(isTeam ? 'BADGE PAR ÉQUIPE' : 'BADGE INDIVIDUEL', pageW / 2, 47, { align: 'center' });

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    const name = clip(pdf, fullName(r), pageW - 16);
    pdf.text(name, pageW / 2, 68, { align: 'center' });

    const rows = [
      ['Club', r.club || '—'],
      ['Catégorie', r.categorie || '—'],
      ['Sexe', r.sexe === 'F' ? 'Fille' : 'Garçon'],
      ['Poids', r.poids ? `${r.poids} kg` : '—'],
    ];
    if (isTeam) rows.push(['Rôle', roleLabel(r)]);

    let y = 80;
    rows.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(191, 219, 254);
      pdf.text(label.toUpperCase(), 14, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(255, 255, 255);
      pdf.text(clip(pdf, value, pageW - 28), 14, y + 6);
      y += 14;
    });

    if (competition.lieu || competition.date_debut) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(226, 232, 240);
      const footer = [competition.lieu, competition.date_debut].filter(Boolean).join('  ·  ');
      pdf.text(clip(pdf, footer, pageW - 16), pageW / 2, pageH - 12, { align: 'center' });
    }
  });

  pdf.save(`fenacoju-badges-${isTeam ? 'equipe' : 'individuel'}-${slug || 'liste'}-${new Date().toISOString().split('T')[0]}.pdf`);
}
