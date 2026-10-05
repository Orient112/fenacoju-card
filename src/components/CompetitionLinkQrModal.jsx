import { useCallback, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { jsPDF } from 'jspdf';

const QR_SIZE = 280;
const EXPORT_SIZE = 720;

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function slugify(value) {
  return String(value || 'competition')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48) || 'competition';
}

async function svgToCanvas(svgEl, size) {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Conversion QR impossible'));
    image.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return canvas;
}

export default function CompetitionLinkQrModal({ url, competitionName, onClose }) {
  const qrWrapRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const getSvg = useCallback(() => {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg) throw new Error('QR Code introuvable');
    return svg;
  }, []);

  const fileBase = `qr-inscription-${slugify(competitionName)}`;

  const handleDownloadJpg = async () => {
    setError('');
    setBusy('jpg');
    try {
      const canvas = await svgToCanvas(getSvg(), EXPORT_SIZE);
      downloadDataUrl(canvas.toDataURL('image/jpeg', 0.92), `${fileBase}.jpg`);
    } catch (err) {
      setError(err.message || 'Téléchargement JPG impossible');
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPdf = async () => {
    setError('');
    setBusy('pdf');
    try {
      const canvas = await svgToCanvas(getSvg(), EXPORT_SIZE);
      const png = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 18;
      let y = 28;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(15, 23, 42);
      pdf.text('QR Code — Lien d\'inscription', pageW / 2, y, { align: 'center' });
      y += 10;

      if (competitionName) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        pdf.setTextColor(29, 67, 147);
        pdf.text(String(competitionName), pageW / 2, y, { align: 'center', maxWidth: pageW - margin * 2 });
        y += 12;
      }

      const qrMm = 90;
      const qrX = (pageW - qrMm) / 2;
      pdf.addImage(png, 'PNG', qrX, y, qrMm, qrMm);
      y += qrMm + 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      const lines = pdf.splitTextToSize(String(url || ''), pageW - margin * 2);
      pdf.text(lines, pageW / 2, y, { align: 'center' });

      pdf.save(`${fileBase}.pdf`);
    } catch (err) {
      setError(err.message || 'Téléchargement PDF impossible');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="competition-link-qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="competition-link-qr-head">
          <div>
            <h3>QR Code d&apos;inscription</h3>
            {competitionName ? <p className="form-hint">{competitionName}</p> : null}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="competition-link-qr-body">
          <div className="competition-link-qr-code" ref={qrWrapRef}>
            <QRCode
              value={url}
              size={QR_SIZE}
              level="M"
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          </div>
          <p className="competition-link-qr-url">{url}</p>
          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <div className="competition-link-qr-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleDownloadJpg}
            disabled={!!busy}
          >
            {busy === 'jpg' ? 'JPG…' : 'Télécharger JPG'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadPdf}
            disabled={!!busy}
          >
            {busy === 'pdf' ? 'PDF…' : 'Télécharger PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
