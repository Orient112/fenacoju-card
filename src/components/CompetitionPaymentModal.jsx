import { useState } from 'react';

function formatMoney(amount) {
  const n = Math.max(0, Number(amount) || 0);
  return `${n.toLocaleString('fr-FR')} FC`;
}

export default function CompetitionPaymentModal({
  title = 'Paiement de l\'inscription',
  summary,
  amount = 0,
  confirmLabel = 'Payer et valider',
  onConfirm,
  onClose,
  busy = false,
}) {
  const [mode, setMode] = useState('especes');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!mode) {
      setError('Choisissez un mode de paiement');
      return;
    }
    try {
      await onConfirm({
        mode,
        reference: reference.trim(),
        montant: Math.max(0, Number(amount) || 0),
      });
    } catch (err) {
      setError(err.message || 'Paiement impossible');
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="competition-payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="competition-params-modal-head">
          <div>
            <h3>{title}</h3>
            {summary ? <p className="form-hint">{summary}</p> : null}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={busy}>
            Fermer
          </button>
        </div>

        <div className="competition-payment-total">
          <span>Montant à régler</span>
          <strong>{formatMoney(amount)}</strong>
        </div>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pay-mode">Mode de paiement *</label>
            <select
              id="pay-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              required
            >
              <option value="especes">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement bancaire</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pay-ref">Référence (optionnel)</label>
            <input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° transaction / reçu"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Validation...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { formatMoney };
