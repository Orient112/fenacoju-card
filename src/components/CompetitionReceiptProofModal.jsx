import { useMemo } from 'react';
import QRCode from 'react-qr-code';
import {
  encodeReceiptQr,
  formatReceiptAmount,
  getReceiptDisplayReference,
} from '../utils/competitionReceipt';

const QR_SIZE = 220;

export default function CompetitionReceiptProofModal({ payload, onClose }) {
  const qrValue = useMemo(
    () => (payload ? encodeReceiptQr(payload) : ''),
    [payload],
  );

  if (!payload) return null;

  const hasPayment = Boolean(payload.orderNumber) || Number(payload.montant) > 0;

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

        {!hasPayment && (
          <div className="competition-receipt-proof-banner is-warn">
            <strong>Aucun paiement enregistré</strong>
            <p>Le QR Code reprend les informations d’inscription disponibles.</p>
          </div>
        )}

        <div className="competition-receipt-proof-body">
          <div className="competition-receipt-proof-qr">
            <QRCode
              value={qrValue || ' '}
              size={QR_SIZE}
              level="M"
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          </div>

          <div className="qr-scan-details-grid">
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Mode</span>
              <span className="qr-scan-detail-value">
                {payload.mode === 'equipe' ? 'Par équipe' : 'Individuel'}
              </span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Référence</span>
              <span className="qr-scan-detail-value">{getReceiptDisplayReference(payload)}</span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Montant</span>
              <span className="qr-scan-detail-value">
                {formatReceiptAmount(payload.montant, payload.monnaie)}
              </span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Téléphone</span>
              <span className="qr-scan-detail-value">{payload.telephone || '—'}</span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Club</span>
              <span className="qr-scan-detail-value">{payload.club || '—'}</span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Date</span>
              <span className="qr-scan-detail-value">
                {payload.date ? new Date(payload.date).toLocaleString('fr-FR') : '—'}
              </span>
            </div>
            <div className="qr-scan-detail-item">
              <span className="qr-scan-detail-label">Participants</span>
              <span className="qr-scan-detail-value">
                {(payload.participants || []).length
                  ? (payload.participants || [])
                    .map((p) => `${p.prenom || ''} ${p.nom || ''}`.trim())
                    .filter(Boolean)
                    .join(', ')
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
