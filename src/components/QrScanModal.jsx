import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { calcAge, formatDate, getCardValidityYear, resolveJudokaFromQrPayload, resolveMediaUrl } from '../api';
import { parseCardQr } from '../utils/parseCardQr';
import JudokaCard from './JudokaCard';

const SCANNER_ID = 'fenacoju-qr-reader';

function JudokaDetails({ judoka }) {
  const fields = [
    { label: 'N° Carte', value: judoka.numero_carte },
    { label: 'Nom', value: judoka.nom },
    { label: 'Prénom', value: judoka.prenom },
    { label: 'Date de naissance', value: `${formatDate(judoka.date_naissance)} (${calcAge(judoka.date_naissance)} ans)` },
    { label: 'Sexe', value: judoka.sexe === 'M' ? 'Masculin' : 'Féminin' },
    { label: 'Club', value: judoka.club },
    { label: 'Grade', value: judoka.grade },
    { label: 'Catégorie', value: judoka.categorie || '—' },
    { label: 'N° Licence', value: judoka.numero_licence || '—' },
    { label: 'Téléphone', value: judoka.telephone || '—' },
    { label: 'Email', value: judoka.email || '—' },
    { label: 'Entraîneur', value: judoka.entraineur_nom || '—' },
    { label: 'Date inscription', value: formatDate(judoka.date_inscription) },
    { label: 'Validité carte', value: `Jusqu'à ${getCardValidityYear(judoka)}` },
    { label: 'Statut', value: judoka.statut === 'actif' ? 'Actif' : 'Inactif' },
  ];

  return (
    <div className="qr-scan-details">
      {judoka.photo && (
        <div className="qr-scan-photo-large">
          <img src={resolveMediaUrl(judoka.photo)} alt="" crossOrigin="anonymous" />
        </div>
      )}
      <div className="qr-scan-details-grid">
        {fields.map((field) => (
          <div key={field.label} className="qr-scan-detail-item">
            <span className="qr-scan-detail-label">{field.label}</span>
            <span className="qr-scan-detail-value">{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QrScanModal({ onClose }) {
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const [phase, setPhase] = useState('scanning');
  const [judoka, setJudoka] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const stopScanner = async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      if (state === 2) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch {
      // Scanner déjà arrêté
    }
    scannerRef.current = null;
  };

  const handleScanSuccess = async (decodedText) => {
    if (processingRef.current) return;

    const payload = parseCardQr(decodedText);
    if (!payload) {
      setError('QR Code non reconnu. Scannez une carte FENACOJU valide.');
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setError('');
    await stopScanner();

    try {
      const data = await resolveJudokaFromQrPayload(payload);
      setJudoka(data);
      setPhase('result');
    } catch {
      setError('Judoka introuvable ou accès refusé.');
      setPhase('scanning');
      processingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phase !== 'scanning') return undefined;

    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          if (!cancelled) handleScanSuccess(text);
        },
        () => {}
      )
      .catch(() => {
        if (!cancelled) {
          setError('Impossible d\'accéder à la caméra. Autorisez l\'accès ou utilisez HTTPS.');
        }
      });

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [phase]);

  const handleScanAgain = () => {
    processingRef.current = false;
    setJudoka(null);
    setError('');
    setPhase('scanning');
  };

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="qr-scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scan-header">
          <h2>{phase === 'result' ? 'Carte scannée' : 'Scanner une carte'}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        {phase === 'scanning' && (
          <div className="qr-scan-body">
            <p className="qr-scan-hint">Placez le QR Code de la carte judoka devant la caméra.</p>
            <div id={SCANNER_ID} className="qr-scan-reader" />
            {loading && <p className="qr-scan-status">Chargement du judoka...</p>}
            {error && <p className="qr-scan-error">{error}</p>}
          </div>
        )}

        {phase === 'result' && judoka && (
          <div className="qr-scan-result">
            <div className="qr-scan-result-card">
              <JudokaCard judoka={judoka} />
            </div>
            <div className="qr-scan-result-info">
              <JudokaDetails judoka={judoka} />
              <div className="qr-scan-result-actions">
                <button type="button" className="btn btn-primary" onClick={handleScanAgain}>
                  Scanner une autre carte
                </button>
                <button type="button" className="btn btn-outline" onClick={onClose}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
