import JudokaCard from './JudokaCard';

export default function CardModal({ judoka, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="card-modal" onClick={(e) => e.stopPropagation()}>
        <JudokaCard judoka={judoka} />
        <div className="card-modal-actions">
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            Imprimer la carte
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
