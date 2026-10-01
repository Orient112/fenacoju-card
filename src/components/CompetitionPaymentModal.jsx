import { useState, useRef, useEffect } from 'react';
import {
  initiatePublicCompetitionPayment,
  checkPublicCompetitionPaymentStatus,
} from '../api';

function formatMoney(amount, currency = 'CDF') {
  const n = Math.max(0, Number(amount) || 0);
  const code = String(currency || 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const suffix = code === 'USD' ? 'USD' : 'FC';
  return `${n.toLocaleString('fr-FR')} ${suffix}`;
}

const POLL_MS = 3000;
const MAX_WAIT_MS = 180000;

function isPaymentConfirmed(st) {
  if (!st) return false;
  if (st.failed || st.outcome === 'failed') return false;
  const code = String(st.code ?? '');
  const msg = String(st.message || '').toLowerCase();
  // Doc SimplyPaye : succès si code === "1"
  if (code === '1' && !/en attente|pending/i.test(msg)) return true;
  if (st.success || st.outcome === 'success') return true;
  return false;
}

function isPaymentFailed(st) {
  if (!st) return false;
  if (st.failed || st.outcome === 'failed') return true;
  const msg = String(st.message || '').toLowerCase();
  return /annul|refus|échou|echec|échec|n'a pas r[eé]ussi|expire|insuffisant/.test(msg);
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
  competitionToken = '',
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
  const [info, setInfo] = useState('');
  const [phase, setPhase] = useState(''); // '' | 'push' | 'check' | 'verify'
  const [paying, setPaying] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [paidPayload, setPaidPayload] = useState(null);
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  const payableAmount = payCurrency === 'USD' ? usd : cdf;
  const effectiveMode = requireMobileMoney ? 'mobile_money' : mode;
  const locked = busy || paying;

  const buildPaiement = (extra = {}) => ({
    mode: effectiveMode,
    telephone: effectiveMode === 'mobile_money' ? telephone.trim() : '',
    montant: payableAmount,
    monnaie: payCurrency,
    ...extra,
  });

  const pollUntilPaid = async (token, on, basePaiement) => {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    while (!abortRef.current && Date.now() - started < MAX_WAIT_MS) {
      const st = await checkPublicCompetitionPaymentStatus(token, on);
      if (isPaymentConfirmed(st)) {
        return { ...basePaiement, orderNumber: on };
      }
      if (isPaymentFailed(st)) {
        throw new Error(st.message || 'Le paiement n\'a pas abouti');
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return null;
  };

  const finalizeRegistration = async (paiement) => {
    setPhase('');
    setInfo('');
    setError('');
    await onConfirm(paiement);
  };

  const handleVerify = async () => {
    if (!orderNumber || !competitionToken) return;
    setPaying(true);
    setError('');
    setInfo('Vérification du paiement…');
    try {
      const st = await checkPublicCompetitionPaymentStatus(competitionToken, orderNumber);
      if (isPaymentConfirmed(st)) {
        const payload = paidPayload || buildPaiement({ orderNumber });
        await finalizeRegistration({ ...payload, orderNumber });
        return;
      }
      if (isPaymentFailed(st)) {
        setPhase('');
        setOrderNumber('');
        setPaidPayload(null);
        throw new Error(st.message || 'Le paiement n\'a pas abouti');
      }
      setPhase('verify');
      setInfo(
        'Le paiement n\'est pas encore confirmé par l\'opérateur. '
        + 'Validez le PIN sur le téléphone, puis cliquez à nouveau sur « Vérifier le paiement ».'
      );
    } catch (err) {
      setError(err.message || 'Vérification impossible');
      setInfo('');
    } finally {
      setPaying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
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

    const base = buildPaiement();
    const needsPush = effectiveMode === 'mobile_money' && payableAmount > 0;

    try {
      setPaying(true);
      if (!needsPush) {
        await finalizeRegistration(base);
        return;
      }
      if (!competitionToken) {
        throw new Error('Lien de compétition invalide pour le paiement');
      }

      setPhase('push');
      setInfo('Paiement envoyé. Confirmez avec votre code PIN sur le téléphone, sans fermer cette fenêtre');
      const initiated = await initiatePublicCompetitionPayment(competitionToken, base);
      const on = initiated.orderNumber;
      if (!on) throw new Error('Impossible d\'obtenir le numéro de transaction');
      setOrderNumber(on);
      const payload = {
        ...base,
        orderNumber: on,
        telephone: initiated.phone || base.telephone,
        montant: initiated.amount ?? base.montant,
        monnaie: initiated.currency || base.monnaie,
      };
      setPaidPayload(payload);
      setPhase('check');

      const paid = await pollUntilPaid(competitionToken, on, payload);
      if (abortRef.current) return;
      if (paid) {
        await finalizeRegistration(paid);
        return;
      }

      setPhase('verify');
      setInfo(
        'La confirmation prend plus de temps que prévu. '
        + 'Si vous avez validé le code PIN, cliquez sur « Vérifier le paiement ».'
      );
    } catch (err) {
      if (orderNumber) setPhase('verify');
      else setPhase('');
      setError(err.message || 'Paiement impossible');
      setInfo('');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="confirm-overlay competition-payment-overlay" onClick={locked ? undefined : onClose}>
      <div className="competition-payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="competition-payment-glow" aria-hidden="true" />
        <div className="competition-payment-modal-inner">
          <div className="competition-payment-head">
            <div>
              <p className="competition-payment-kicker">SimplyPaye · Sécurisé</p>
              <h3>{title}</h3>
              {summary ? <p className="competition-payment-summary">{summary}</p> : null}
            </div>
            <button
              type="button"
              className="competition-payment-close"
              onClick={onClose}
              disabled={locked}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>

          <div className="competition-payment-total">
            <span>Montant à régler</span>
            <strong>{formatMoney(payableAmount, payCurrency)}</strong>
          </div>

          {error && <div className="form-error">{error}</div>}
          {!error && info && (
            <div className="competition-payment-wait">{info}</div>
          )}
          {!error && !info && (paying || phase === 'push' || phase === 'check') && payableAmount > 0 && (
            <div className="competition-payment-wait">
              Paiement envoyé. Confirmez avec votre code PIN sur le téléphone, sans fermer cette fenêtre
            </div>
          )}

          <form className="competition-payment-form" onSubmit={handleSubmit}>
            <div className="competition-payment-grid">
              <div className="form-group competition-payment-currency">
                <label htmlFor="pay-currency">Monnaie de paiement *</label>
                <select
                  id="pay-currency"
                  value={payCurrency}
                  onChange={(e) => setPayCurrency(e.target.value === 'USD' ? 'USD' : 'CDF')}
                  required
                  disabled={locked || Boolean(orderNumber)}
                >
                  <option value="CDF" disabled={cdf <= 0 && usd > 0}>Franc Congolais (FC)</option>
                  <option value="USD" disabled={usd <= 0 && cdf > 0}>Dollars (USD)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pay-mode">Mode de paiement *</label>
                <select
                  id="pay-mode"
                  value={effectiveMode}
                  onChange={(e) => setMode(e.target.value)}
                  required
                  disabled={locked || requireMobileMoney || Boolean(orderNumber)}
                >
                  <option value="mobile_money">Mobile Money</option>
                  {!requireMobileMoney && <option value="carte_visa">Carte Visa</option>}
                </select>
              </div>
            </div>
            {requireMobileMoney && (
              <p className="form-hint">Paiement via SimplyPaye : un push PIN sera envoyé sur ce numéro.</p>
            )}
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
                  disabled={locked || Boolean(orderNumber)}
                />
              </div>
            )}
            <div className="competition-payment-actions">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={locked}>
                Annuler
              </button>
              {phase === 'verify' && orderNumber ? (
                <button
                  type="button"
                  className="btn btn-primary competition-payment-cta"
                  disabled={locked}
                  onClick={handleVerify}
                >
                  {paying ? 'Vérification…' : 'Vérifier le paiement'}
                </button>
              ) : (
                <button type="submit" className="btn btn-primary competition-payment-cta" disabled={locked}>
                  {paying
                    ? (payableAmount > 0 ? 'Paiement en cours…' : 'Validation…')
                    : confirmLabel}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export { formatMoney };
