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
  amountCdf,
  amountUsd,
  currency = 'CDF',
  confirmLabel = 'Payer',
  onConfirm,
  onClose,
  busy = false,
  requireMobileMoney = false,
}) {
  const cdf = Math.max(0, Number(amountCdf ?? (String(currency).toUpperCase() === 'USD' ? 0 : amount)) || 0);
  const usd = Math.max(0, Number(amountUsd ?? (String(currency).toUpperCase() === 'USD' ? amount : 0)) || 0);
  const defaultCurrency = String(currency || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const [mode, setMode] = useState('mobile_money');
  const [telephone, setTelephone] = useState('');
  const [payCurrency, setPayCurrency] = useState(
    defaultCurrency === 'USD' && usd > 0 ? 'USD' : (cdf > 0 ? 'CDF' : defaultCurrency)
  );
  const [error, setError] = useState('');
  const [phase, setPhase] = useState(''); // '' | 'push' | 'check'

  const payableAmount = payCurrency === 'USD' ? usd : cdf;
  const effectiveMode = requireMobileMoney ? 'mobile_money' : mode;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!effectiveMode) {
      setError('Choisissez un mode de paiement');
      return;
    }
    if (effectiveMode === 'mobile_money') {
      const phone = telephone.trim();
      if (!phone || phone.replace(/\D/g, '').length < 8) {
        setError('Saisissez un numéro mobile valide');
        return;
      }
    } else if (effectiveMode === 'carte_visa' && payableAmount > 0) {
      setError('Pour ce montant, utilisez Mobile Money (validation par push PIN)');
      return;
    }
    try {
      if (effectiveMode === 'mobile_money' && payableAmount > 0) {
        setPhase('push');
      }
      await onConfirm({
        mode: effectiveMode,
        telephone: effectiveMode === 'mobile_money' ? telephone.trim() : '',
        montant: payableAmount,
        monnaie: payCurrency,
      });
      setPhase('');
    } catch (err) {
      setPhase('');
      setError(err.message || 'Paiement impossible');
    }
  };

  return (
    <div className="confirm-overlay" onClick={busy ? undefined : onClose}>
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

        <div className="form-group competition-payment-currency">
          <label htmlFor="pay-currency">Monnaie de paiement *</label>
          <select
            id="pay-currency"
            value={payCurrency}
            onChange={(e) => setPayCurrency(e.target.value === 'USD' ? 'USD' : 'CDF')}
            required
            disabled={busy}
          >
            <option value="CDF" disabled={cdf <= 0 && usd > 0}>Franc Congolais (FC)</option>
            <option value="USD" disabled={usd <= 0 && cdf > 0}>Dollars (USD)</option>
          </select>
        </div>

        <div className="competition-payment-total">
          <span>Montant à régler</span>
          <strong>{formatMoney(payableAmount, payCurrency)}</strong>
        </div>

        {error && <div className="form-error">{error}</div>}

        {(busy || phase) && payableAmount > 0 && (
          <div className="competition-payment-wait form-hint">
            {phase === 'push' || busy
              ? 'Paiement envoyé. Confirmez avec votre code PIN sur le téléphone, sans fermer cette fenêtre'
              : null}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pay-mode">Mode de paiement *</label>
            <select
              id="pay-mode"
              value={effectiveMode}
              onChange={(e) => setMode(e.target.value)}
              required
              disabled={busy || requireMobileMoney}
            >
              <option value="mobile_money">Mobile Money</option>
              {!requireMobileMoney && <option value="carte_visa">Carte Visa</option>}
            </select>
            {requireMobileMoney && (
              <p className="form-hint">Paiement via SimplyPaye : un push PIN sera envoyé sur ce numéro.</p>
            )}
          </div>
          {effectiveMode === 'mobile_money' && (
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
                disabled={busy}
              />
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy
                ? (payableAmount > 0 ? 'Paiement en cours...' : 'Validation...')
                : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { formatMoney };
