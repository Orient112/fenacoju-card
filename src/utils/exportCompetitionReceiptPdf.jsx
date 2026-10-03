import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import QRCode from 'react-qr-code';
import {
  buildReceiptPayload,
  displayReceiptReference,
  encodeReceiptQr,
  formatReceiptAmount,
} from './competitionReceipt';

async function qrCodePngDataUrl(value, size = 280) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden;';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    await new Promise((resolve) => {
      root.render(createElement(QRCode, {
        value,
        size,
        level: 'M',
        bgColor: '#ffffff',
        fgColor: '#0f172a',
      }));
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    const svg = host.querySelector('svg');
    if (!svg) throw new Error('QR Code introuvable');

    const xml = new XMLSerializer().serializeToString(svg);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    const pngUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Conversion QR impossible'));
      img.src = svgUrl;
    });

    return pngUrl;
  } finally {
    try {
      root.unmount();
    } catch {
      // ignore
    }
    host.remove();
  }
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

function drawRow(pdf, label, value, x, y, labelW, valueW) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label, x, y);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text(clip(pdf, value, valueW), x + labelW, y);
  return y + 6.5;
}

/**
 * Génère et ouvre le reçu PDF de paiement compétition.
 * @returns {{ payload: object, filename: string }}
 */
export async function exportCompetitionReceiptPdf({
  competition,
  mode,
  paiement,
  participants,
  registrations,
  club,
  sexe,
  open = true,
}) {
  const payload = buildReceiptPayload({
    competition,
    mode,
    paiement,
    participants,
    registrations,
    club,
    sexe,
  });

  const qrValue = encodeReceiptQr(payload);
  const qrPng = await qrCodePngDataUrl(qrValue, 320);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 16;
  let y = 18;

  pdf.setFillColor(18, 45, 102);
  pdf.rect(0, 0, pageW, 28, 'F');
  pdf.setFillColor(245, 197, 24);
  pdf.rect(0, 28, pageW, 1.5, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('FENACOJU', margin, 12);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Reçu de paiement — Compétition', margin, 19);
  pdf.setFontSize(8);
  pdf.text('Fédération Nationale Congolaise de Judo', margin, 24.5);

  y = 40;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(clip(pdf, payload.competitionNom, pageW - margin * 2), margin, y);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    payload.mode === 'equipe' ? 'Inscription par équipe' : 'Inscription individuelle',
    margin,
    y
  );
  y += 10;

  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin, y, pageW - margin * 2, 38, 0, 0, 'FD');

  let infoY = y + 8;
  const labelW = 42;
  const valueW = pageW - margin * 2 - labelW - 8;
  infoY = drawRow(pdf, 'Date', new Date(payload.date).toLocaleString('fr-FR'), margin + 4, infoY, labelW, valueW);
  infoY = drawRow(
    pdf,
    'Référence',
    displayReceiptReference(payload.orderNumber, payload.telephone),
    margin + 4,
    infoY,
    labelW,
    valueW
  );
  infoY = drawRow(
    pdf,
    'Montant payé',
    formatReceiptAmount(payload.montant, payload.monnaie),
    margin + 4,
    infoY,
    labelW,
    valueW
  );
  infoY = drawRow(pdf, 'Téléphone', payload.telephone || '—', margin + 4, infoY, labelW, valueW);
  if (payload.club) {
    drawRow(pdf, 'Club', payload.club, margin + 4, infoY, labelW, valueW);
  }

  y += 46;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(18, 45, 102);
  pdf.text('Détails de l\'inscription', margin, y);
  y += 6;

  const people = payload.participants || [];
  if (!people.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Aucun participant listé.', margin, y);
    y += 8;
  } else {
    people.forEach((p, index) => {
      if (y > 230) {
        pdf.addPage();
        y = 20;
      }
      const name = `${p.prenom || ''} ${p.nom || ''}`.trim() || `Judoka ${index + 1}`;
      const meta = [
        p.club,
        p.categorie,
        p.role === 'remplacant' ? 'Remplaçant' : (p.role === 'principal' ? 'Principal' : ''),
        p.sexe === 'F' ? 'Fille' : (p.sexe === 'M' ? 'Garçon' : ''),
      ].filter(Boolean).join(' · ');

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(margin, y, pageW - margin * 2, 12, 'S');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(clip(pdf, name, pageW - margin * 2 - 8), margin + 3, y + 5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(clip(pdf, meta || '—', pageW - margin * 2 - 8), margin + 3, y + 9.5);
      y += 14;
    });
  }

  y = Math.max(y + 6, 235);
  if (y > 250) {
    pdf.addPage();
    y = 20;
  }

  const qrSizeMm = 42;
  const qrX = (pageW - qrSizeMm) / 2;
  pdf.addImage(qrPng, 'PNG', qrX, y, qrSizeMm, qrSizeMm);
  y += qrSizeMm + 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    'Ce QR Code contient toutes les informations du reçu',
    pageW / 2,
    y,
    { align: 'center', maxWidth: pageW - margin * 2 }
  );

  const slug = (payload.competitionNom || 'competition')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
  const ref = displayReceiptReference(payload.orderNumber, payload.telephone)
    .replace(/[^a-z0-9]+/gi, '')
    .slice(0, 18)
    || Date.now().toString(36);
  const filename = `recu-paiement-${slug}-${ref}.pdf`;

  // Télécharger puis ouvrir le PDF
  pdf.save(filename);
  try {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    // le téléchargement a déjà eu lieu via pdf.save
  }

  return { payload, filename };
}
