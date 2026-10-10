import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { encodeReceiptQr } from '../utils/competitionReceipt';
import { exportCompetitionReceiptPdf } from '../utils/exportCompetitionReceiptPdf';

const QR_SIZE = 220;

export default function CompetitionReceiptProofModal({ payload, exportArgs, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const qrValue = useMemo(
    () => (payload ? encodeReceiptQr(payload) : ''),
    [payload],
  );

  if (!payload) return null;

  const participantsLabel = (payload.participants || []).length
    ? (payload.participants || [])
      .map((p) => `${p.prenom || ''} ${p.nom || ''}`.trim())
      .filter(Boolean)
      .join(', ')
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
      <div className="competition-receipt-proof-modal" onClick={(e) => e.stopPropagation()}>
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

          <div className="qr-scan-details-grid">
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Mode</span>
              <span className="qr-scan-detail-value">
                {payload.mode === 'equipe' ? 'Par équipe' : 'Individuel'}
              </span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Club</span>
              <span className="qr-scan-detail-value">{payload.club || '—'}</span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Participants</span>
              <span className="qr-scan-detail-value">{participantsLabel}</span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Date</span>
              <span className="qr-scan-detail-value">
                {payload.date ? new Date(payload.date).toLocaleString('fr-FR') : '—'}
              </span>
            </div>
          </div>
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
