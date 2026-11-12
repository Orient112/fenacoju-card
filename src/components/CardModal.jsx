import { useState } from 'react';
import JudokaCard from './JudokaCard';

function collectCardStyles() {
  const chunks = [];
  for (const sheet of Array.from(document.styleSheets || [])) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        const text = rule.cssText || '';
        if (
          text.includes('.judoka-card')
          || text.includes('.card-')
          || text.includes('@page')
          || text.includes('printing-card')
        ) {
          chunks.push(text);
        }
      }
    } catch {
      // Feuilles cross-origin ignorées
    }
  }
  return chunks.join('\n');
}

export default function CardModal({ judoka, onClose, design = null, branding = null }) {
  const [exporting, setExporting] = useState(false);

  const handlePrint = () => {
    const card = document.getElementById('printable-card');
    if (!card) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=400,height=300');
    if (!printWindow) {
      document.body.classList.add('printing-card');
      const cleanup = () => {
        document.body.classList.remove('printing-card');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
      return;
    }

    const styles = collectCardStyles();
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Carte ${judoka.numero_carte || ''}</title>
  <style>
    @page { size: 85mm 55mm; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 85mm !important;
      height: 55mm !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    ${styles}
    .judoka-card, #printable-card {
      width: 85mm !important;
      height: 55mm !important;
      margin: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      border: none !important;
      max-width: none !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body>${card.outerHTML}</body>
</html>`);
    printWindow.document.close();

    const triggerPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } finally {
        setTimeout(() => {
          try { printWindow.close(); } catch { /* ignore */ }
        }, 400);
      }
    };

    if (printWindow.document.readyState === 'complete') {
      setTimeout(triggerPrint, 120);
    } else {
      printWindow.onload = () => setTimeout(triggerPrint, 120);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { captureCardImage } = await import('../utils/captureCardImage.jsx');
      const dataUrl = await captureCardImage(judoka, { design, branding });

      const link = document.createElement('a');
      link.download = `carte-${judoka.numero_carte}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert('Impossible d\'exporter la carte. Réessayez après le chargement complet des images.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="card-modal" onClick={(e) => e.stopPropagation()}>
        <JudokaCard judoka={judoka} design={design} branding={branding} />
        <div className="card-modal-actions">
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            Imprimer la carte
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Export...' : 'Exporter'}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
