import { useState } from 'react';

function formatMoney(amount, currency = 'CDF') {
  const n = Math.max(0, Number(amount) || 0);
  const code = String(currency || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const suffix = code === 'USD' ? 'USD' : 'FC';
  return `${n.toLocaleString('fr-FR')} ${suffix}`;
}

export default function CompetitionPaymentModal({
  title = 'Paiement de l\'inscription',
  summary,
  amount = 0,
  currency = 'CDF',
  confirmLabel = 'Payer et Valider',
  onConfirm,
  onClose,
  busy = false,
}) {
  const [mode, setMode] = useState('mobile_money');
  const [telephone, setTelephone] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!mode) {
      setError('Choisissez un mode de paiement');
      return;
    }
    if (mode === 'mobile_money') {
      const phone = telephone.trim();
      if (!phone || phone.replace(/\D/g, '').length < 8) {
        setError('Saisissez un numéro mobile valide');
        return;
      }
    }
    try {
      await onConfirm({
        mode,
        telephone: mode === 'mobile_money' ? telephone.trim() : '',
        montant: Math.max(0, Number(amount) || 0),
        monnaie: currency,
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
          <strong>{formatMoney(amount, currency)}</strong>
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
              <option value="mobile_money">Mobile Money</option>
              <option value="carte_visa">Carte Visa</option>
            </select>
          </div>
          {mode === 'mobile_money' && (
            <div className="form-group">
              <label htmlFor="pay-phone">Numéro mobile *</label>
              <input
                id="pay-phone"
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="Ex. 0990123456"
                required
                autoComplete="tel"
              />
            </div>
          )}
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
