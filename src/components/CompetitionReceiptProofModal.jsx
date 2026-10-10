import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { encodeReceiptQr } from '../utils/competitionReceipt';
import { exportCompetitionReceiptPdf } from '../utils/exportCompetitionReceiptPdf';

const QR_SIZE = 200;

function participantName(p) {
  return `${p?.prenom || ''} ${p?.nom || ''}`.trim();
}

export default function CompetitionReceiptProofModal({ payload, exportArgs, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const qrValue = useMemo(
    () => (payload ? encodeReceiptQr(payload) : ''),
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

  const handleDownload = async () => {
    if (!exportArgs || busy) return;
    setBusy(true);
    setError('');
    try {
      await exportCompetitionReceiptPdf({
        ...exportArgs,
        open: true,
      });
    } catch (err) {
      setError(err.message || 'Téléchargement PDF impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
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
            {qrValue ? (
              <QRCode
                value={qrValue}
                size={QR_SIZE}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            ) : (
              <p className="form-hint">QR Code indisponible</p>
            )}
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
                  <p className="form-hint">Aucun participant</p>
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
