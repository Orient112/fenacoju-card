import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getCameraDisplayName,
  getCameraStartTarget,
  isMobileDevice,
  pickDesktopCamera,
} from '../utils/cameraDevices';
import {
  formatReceiptAmount,
  parseReceiptQr,
  verifyReceiptAuthenticity,
} from '../utils/competitionReceipt';

const SCANNER_ID = 'fenacoju-receipt-qr-reader';
const SCAN_DEBOUNCE_MS = 1200;

function getQrBoxSize(viewfinderWidth, viewfinderHeight) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.floor(minEdge * 0.72);
  return { width: size, height: size };
}

export default function ReceiptScanModal({
  onClose,
  competition,
  registrations = [],
}) {
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef({ text: '', at: 0 });
  const fileInputRef = useRef(null);
  const [phase, setPhase] = useState('scanning');
  const [scanSession, setScanSession] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isMobile] = useState(() => isMobileDevice());
  const [preferredFacing, setPreferredFacing] = useState('environment');
  const [activeCameraLabel, setActiveCameraLabel] = useState('');
  const [mobileCameraSwitchEnabled, setMobileCameraSwitchEnabled] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      await scanner.stop();
    } catch {
      // déjà arrêté
    }
    try {
      scanner.clear();
    } catch {
      // déjà nettoyé
    }
  }, []);

  const processQrText = useCallback(async (decodedText) => {
    if (processingRef.current) return;
    const text = (decodedText || '').trim();
    if (!text) return;

    const now = Date.now();
    if (lastScanRef.current.text === text && now - lastScanRef.current.at < SCAN_DEBOUNCE_MS) {
      return;
    }
    lastScanRef.current = { text, at: now };

    const payload = parseReceiptQr(text);
    if (!payload) {
      setError('QR Code non reconnu. Scannez le QR Code d’un reçu de paiement FENACOJU.');
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setError('');
    await stopScanner();

    try {
      const verification = verifyReceiptAuthenticity(payload, {
        competition,
        registrations,
      });
      setResult(verification);
      setPhase('result');
    } catch (err) {
      setError(err.message || 'Impossible de vérifier ce reçu.');
      setScanSession((v) => v + 1);
    } finally {
      setLoading(false);
      processingRef.current = false;
    }
  }, [competition, registrations, stopScanner]);

  useEffect(() => {
    if (phase !== 'scanning') return undefined;

    let cancelled = false;
    setCameraReady(false);
    setError('');

    const startScanner = async () => {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      const config = {
        fps: 24,
        qrbox: getQrBoxSize,
        aspectRatio: 1,
        disableFlip: false,
      };
      const onScan = (text) => {
        if (!cancelled) processQrText(text);
      };

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setMobileCameraSwitchEnabled(isMobile);

        let startTarget;
        if (isMobile) {
          startTarget = getCameraStartTarget(cameras, preferredFacing);
        } else {
          const desktopCamera = pickDesktopCamera(cameras);
          startTarget = desktopCamera?.id || { facingMode: 'user' };
        }

        setActiveCameraLabel(getCameraDisplayName(cameras, startTarget));
        await scanner.start(startTarget, config, onScan, () => {});
        if (!cancelled) setCameraReady(true);
      } catch {
        if (!cancelled) {
          setError('Impossible d\'accéder à la caméra. Autorisez l\'accès ou importez une photo du QR.');
        }
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [phase, scanSession, preferredFacing, isMobile, processQrText, stopScanner]);

  const handleScanAgain = () => {
    processingRef.current = false;
    lastScanRef.current = { text: '', at: 0 };
    setResult(null);
    setError('');
    setPhase('scanning');
    setScanSession((v) => v + 1);
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || processingRef.current) return;
    setError('');
    try {
      const text = await Html5Qrcode.scanFile(file, true);
      await processQrText(text);
    } catch {
      setError('Aucun QR Code détecté dans cette image.');
    }
  };

  const authentic = result?.authentic;
  const payload = result?.payload;
  const title = phase === 'result'
    ? (authentic ? 'Reçu authentique' : 'Reçu non valide')
    : 'Scan reçu de paiement';

  return (
    <div className="card-overlay" onClick={onClose}>
      <div
        className={`qr-scan-modal ${phase === 'result' ? 'qr-scan-modal-found' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`qr-scan-header ${authentic ? 'qr-scan-header-success' : ''}`}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        {phase === 'scanning' && (
          <div className="qr-scan-body">
            <p className="form-hint">
              Scannez le QR Code en bas du reçu PDF pour confirmer l’authenticité du paiement.
            </p>
            <div id={SCANNER_ID} className="qr-scan-reader" />
            {!cameraReady && !error && (
              <p className="form-hint">Initialisation de la caméra…</p>
            )}
            {activeCameraLabel && cameraReady && (
              <p className="form-hint">Caméra : {activeCameraLabel}</p>
            )}
            {mobileCameraSwitchEnabled && (
              <div className="qr-scan-facing-switch">
                <button
                  type="button"
                  className={`btn btn-sm ${preferredFacing === 'environment' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    setPreferredFacing('environment');
                    setScanSession((v) => v + 1);
                  }}
                >
                  Arrière
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${preferredFacing === 'user' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    setPreferredFacing('user');
                    setScanSession((v) => v + 1);
                  }}
                >
                  Avant
                </button>
              </div>
            )}
            <div className="qr-scan-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Importer une photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileSelect}
              />
            </div>
            {loading && <p className="form-hint">Vérification du reçu…</p>}
            {error && <p className="form-error">{error}</p>}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="qr-scan-body receipt-scan-result">
            <div className={`receipt-scan-banner ${authentic ? 'is-ok' : 'is-bad'}`}>
              <strong>{authentic ? 'Authentique' : 'Non authentique'}</strong>
              <p>{result.message}</p>
            </div>

            {payload && (
              <div className="qr-scan-details-grid">
                <div className="qr-scan-detail-item">
                  <span className="qr-scan-detail-label">Compétition</span>
                  <span className="qr-scan-detail-value">{payload.competitionNom || '—'}</span>
                </div>
                <div className="qr-scan-detail-item">
                  <span className="qr-scan-detail-label">Mode</span>
                  <span className="qr-scan-detail-value">
                    {payload.mode === 'equipe' ? 'Par équipe' : 'Individuel'}
                  </span>
                </div>
                <div className="qr-scan-detail-item">
                  <span className="qr-scan-detail-label">Référence</span>
                  <span className="qr-scan-detail-value">{payload.orderNumber || '—'}</span>
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
                {Array.isArray(result.matches) && (
                  <div className="qr-scan-detail-item">
                    <span className="qr-scan-detail-label">Inscriptions liées</span>
                    <span className="qr-scan-detail-value">{result.matches.length}</span>
                  </div>
                )}
              </div>
            )}

            <div className="qr-scan-result-actions-footer">
              <button type="button" className="btn btn-primary" onClick={handleScanAgain}>
                Scanner un autre reçu
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
