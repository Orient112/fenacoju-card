import { jsPDF } from 'jspdf';
import { captureCardImage } from './captureCardImage';

export async function exportCardsToPdf(judokas, onProgress) {
  if (!judokas.length) {
    throw new Error('Aucune carte à exporter');
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 55] });

  for (let i = 0; i < judokas.length; i++) {
    if (i > 0) {
      pdf.addPage([85, 55], 'landscape');
    }
    const dataUrl = await captureCardImage(judokas[i]);
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 85, 55);
    onProgress?.(i + 1, judokas.length);
  }

  pdf.save(`fenacoju-cartes-${new Date().toISOString().split('T')[0]}.pdf`);
}
