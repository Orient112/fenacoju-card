import { useState } from 'react';
import JudokaCard from './JudokaCard';

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
    setExporting(true);
    try {
      const { captureCardImage } = await import('../utils/captureCardImage.jsx');
      const dataUrl = await captureCardImage(judoka);

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
