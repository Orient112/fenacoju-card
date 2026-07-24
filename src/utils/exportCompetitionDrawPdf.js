import { jsPDF } from 'jspdf';

export function exportCompetitionDrawToPdf(drawResult, competition = {}) {
  if (!drawResult?.groups?.length) {
    throw new Error('Aucune grille de combat à exporter');
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;

  const ensureSpace = (needed = 20) => {
    if (y > pageHeight - needed) {
      pdf.addPage();
      y = 18;
      return true;
    }
    return false;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(competition.nom || 'Compétition FENACOJU', marginX, y);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Grille de Combat · ${drawResult.modeLabel || ''}`, marginX, y);
  y += 6;

  pdf.setFontSize(10);
  const meta = [
    competition.lieu ? `Lieu : ${competition.lieu}` : null,
    competition.date_debut ? `Date : ${competition.date_debut}` : null,
    `${drawResult.totalFights || 0} combat${(drawResult.totalFights || 0) > 1 ? 's' : ''}`,
    `${drawResult.totalJudokas || 0} judoka${(drawResult.totalJudokas || 0) > 1 ? 's' : ''}`,
  ].filter(Boolean);
  pdf.text(meta.join('  ·  '), marginX, y);
  y += 10;

  drawResult.groups.forEach((group) => {
    ensureSpace(28);

    pdf.setFillColor(29, 67, 147);
    pdf.rect(marginX, y - 4.5, usableWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(group.title || 'Catégorie', marginX + 2, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `${group.count} judoka${group.count > 1 ? 's' : ''}`,
      marginX + usableWidth - 2,
      y,
      { align: 'right' }
    );
    y += 10;
    pdf.setTextColor(15, 23, 42);

    if (!group.fights?.length && !group.bye) {
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text('Pas de combat dans cette catégorie.', marginX + 2, y);
      pdf.setTextColor(15, 23, 42);
      y += 8;
      return;
    }

    (group.fights || []).forEach((fight, idx) => {
      ensureSpace(18);
      pdf.setDrawColor(219, 228, 240);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(marginX, y - 4, usableWidth, 14, 1.5, 1.5, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Combat ${idx + 1}`, marginX + 3, y);

      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(10);
      const left = fight.labelA || '—';
      const right = fight.labelB || '—';
      pdf.text(left, marginX + 3, y + 5);
      pdf.setTextColor(227, 6, 19);
      pdf.setFont('helvetica', 'bold');
      pdf.text('vs', pageWidth / 2, y + 5, { align: 'center' });
      pdf.setTextColor(15, 23, 42);
      pdf.text(right, marginX + usableWidth - 3, y + 5, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      const clubs = `${fight.a?.club || '—'}  ·  ${fight.b?.club || '—'}`;
      pdf.text(clubs, pageWidth / 2, y + 8.5, { align: 'center' });
      pdf.setTextColor(15, 23, 42);
      y += 17;
    });

    if (group.bye) {
      ensureSpace(12);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      const byeLabel = `Exempt : ${group.bye.label || '—'}${group.bye.club ? ` (${group.bye.club})` : ''}`;
      pdf.text(byeLabel, marginX + 2, y);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'normal');
      y += 8;
    }

    y += 4;
  });

  const slug = (competition.nom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const modeSlug = (drawResult.mode || 'tirage').replace(/[^a-z0-9]+/gi, '-');
  pdf.save(`fenacoju-grille-${modeSlug}-${slug || 'combat'}-${new Date().toISOString().split('T')[0]}.pdf`);
}
