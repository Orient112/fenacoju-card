import { useState } from 'react';
import { toJpeg } from 'html-to-image';
import JudokaCard from './JudokaCard';

async function waitForImages(container) {
  const images = container.querySelectorAll('img');
  await Promise.all(
    [...images].map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
    )
  );
}

export default function CardModal({ judoka, onClose }) {
  const [exporting, setExporting] = useState(false);

  const handlePrint = () => {
    document.body.classList.add('printing-card');
    const cleanup = () => {
      document.body.classList.remove('printing-card');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const handleExport = async () => {
    const node = document.getElementById('printable-card');
    if (!node) return;

    setExporting(true);
    try {
      await waitForImages(node);
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        width: node.offsetWidth,
        height: node.offsetHeight,
        cacheBust: true,
      });

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
        <JudokaCard judoka={judoka} />
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
