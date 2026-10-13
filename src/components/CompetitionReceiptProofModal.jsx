import { Component, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  encodeReceiptQr,
  formatReceiptAmount,
  getCompetitionFeeCdf,
} from '../utils/competitionReceipt';
import { exportCompetitionReceiptPdf } from '../utils/exportCompetitionReceiptPdf';

const QR_SIZE = 200;

function participantName(p) {
  return `${p?.prenom || ''} ${p?.nom || ''}`.trim();
}

/** QR compact pour éviter plantage si beaucoup de judokas (Par équipe). */
function encodeDisplayQr(payload) {
  if (!payload) return '';
  const full = encodeReceiptQr(payload);
  // Si le payload est raisonnable, garder le QR complet
  if (full.length <= 900) return full;
  const compact = {
    v: payload.v,
    t: payload.t,
    competitionToken: payload.competitionToken,
    competitionNom: payload.competitionNom,
    mode: payload.mode,
    orderNumber: payload.orderNumber,
    montant: payload.montant,
    monnaie: payload.monnaie,
    club: payload.club,
    date: payload.date,
    count: (payload.participants || []).length,
    registrationIds: (payload.registrationIds || []).slice(0, 20),
    c: payload.c,
  };
  return JSON.stringify(compact);
}

class QrErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="form-hint">QR Code indisponible</p>;
    }
    return this.props.children;
  }
}

function SafeQr({ value, size }) {
  if (!value) {
    return <p className="form-hint">QR Code indisponible</p>;
  }
  return (
    <QrErrorBoundary key={value.slice(0, 32)}>
      <QRCode
        value={value}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#0f172a"
      />
    </QrErrorBoundary>
  );
}

export default function CompetitionReceiptProofModal({ payload, exportArgs, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const qrValue = useMemo(
    () => (payload ? encodeDisplayQr(payload) : ''),
    [payload],
  );

  if (!payload) return null;

  const isTeam = payload.mode === 'equipe';
  const participants = (payload.participants || [])
    .map((p) => ({
      name: participantName(p),
      role: String(p.role || '').trim(),
      categorie: String(p.categorie || '').trim(),
    }))
    .filter((p) => p.name);

  const dateLabel = payload.date
    ? new Date(payload.date).toLocaleString('fr-FR')
    : '—';

  const resolvedMontant = (() => {
    const fee = getCompetitionFeeCdf(
      exportArgs?.competition,
      isTeam ? 'equipe' : 'individuel',
      isTeam ? 1 : Math.max(1, participants.length || 1),
    );
    if (fee > 0) return fee;
    if (Number(payload.montant) > 0) return Number(payload.montant);
    if (Number(exportArgs?.paiement?.montant) > 0) return Number(exportArgs.paiement.montant);
    return 0;
  })();
  const amountLabel = formatReceiptAmount(resolvedMontant, 'CDF');

  const handleDownload = async () => {
    if (!exportArgs || busy) return;
    setBusy(true);
    setError('');
    try {
      await exportCompetitionReceiptPdf({
        ...exportArgs,
        paiement: {
          ...(exportArgs.paiement || {}),
          montant: resolvedMontant,
          monnaie: 'CDF',
        },
        open: true,
      });
    } catch (err) {
      setError(err.message || 'Téléchargement PDF impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-overlay competition-receipt-proof-overlay" onClick={onClose}>
      <div
        className={`competition-receipt-proof-modal ${isTeam ? 'is-team' : 'is-individuel'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="competition-receipt-proof-head">
          <div>
            <h3>Preuve de paiement</h3>
            <p className="form-hint">{payload.competitionNom || 'Compétition'}</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="competition-receipt-proof-body">
          <div className="competition-receipt-proof-qr">
            <SafeQr value={qrValue} size={QR_SIZE} />
          </div>

          {!isTeam ? (
            <div className="competition-receipt-proof-info">
              <p className="competition-receipt-proof-participant-name">
                {participants[0]?.name || '—'}
              </p>
              <div className="competition-receipt-proof-meta">
                <div className="competition-receipt-proof-meta-row">
                  <span>Club</span>
                  <strong>{payload.club || '—'}</strong>
                </div>
                <div className="competition-receipt-proof-meta-row">
                  <span>Montant</span>
                  <strong>{amountLabel}</strong>
                </div>
                <div className="competition-receipt-proof-meta-row">
                  <span>Date</span>
                  <strong>{dateLabel}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="competition-receipt-proof-info">
              <div className="competition-receipt-proof-meta">
                <div className="competition-receipt-proof-meta-row">
                  <span>Club</span>
                  <strong className="competition-receipt-proof-club">{payload.club || '—'}</strong>
                </div>
                <div className="competition-receipt-proof-meta-row">
                  <span>Montant</span>
                  <strong>{amountLabel}</strong>
                </div>
                <div className="competition-receipt-proof-meta-row">
                  <span>Date</span>
                  <strong>{dateLabel}</strong>
                </div>
              </div>
              <div className="competition-receipt-proof-participants">
                <span className="competition-receipt-proof-participants-label">
                  Participants
                  {participants.length ? ` (${participants.length})` : ''}
                </span>
                {participants.length ? (
                  <ul className="competition-receipt-proof-participants-list">
                    {participants.map((p, index) => (
                      <li key={`${p.name}-${index}`}>
                        <span className="competition-receipt-proof-participant-main">{p.name}</span>
                        {(p.role || p.categorie) && (
                          <span className="competition-receipt-proof-participant-sub">
                            {[p.role, p.categorie].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="form-hint">Aucun participant listé — vous pouvez quand même télécharger le PDF.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {error ? <p className="form-error" style={{ marginBottom: 0 }}>{error}</p> : null}

        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={busy || !exportArgs}
          >
            {busy ? 'Téléchargement…' : 'Télécharger'}
          </button>
        </div>
      </div>
    </div>
  );
}
