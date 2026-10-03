import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getCameraStartTarget,
  isMobileDevice,
  pickDesktopCamera,
} from '../utils/cameraDevices';
import {
  formatReceiptAmount,
  getReceiptDisplayReference,
  parseReceiptQr,
  verifyReceiptAuthenticity,
} from '../utils/competitionReceipt';

const SCANNER_ID = 'fenacoju-receipt-qr-reader';
const SCAN_DEBOUNCE_MS = 1400;
const FIXED_QR_BOX = 240;

export default function ReceiptScanModal({
  onClose,
  competition,
  registrations = [],
}) {
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const processingRef = useRef(false);
  const lastScanRef = useRef({ text: '', at: 0 });
  const competitionRef = useRef(competition);
  const registrationsRef = useRef(registrations);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState('scanning');
  const [scanSession, setScanSession] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isMobile] = useState(() => isMobileDevice());
  const [preferredFacing, setPreferredFacing] = useState('environment');

  useEffect(() => {
    competitionRef.current = competition;
  }, [competition]);

  useEffect(() => {
    registrationsRef.current = registrations;
  }, [registrations]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
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
      if (mountedRef.current) {
        setError('QR Code non reconnu. Scannez le QR Code d’un reçu de paiement FENACOJU.');
      }
      return;
    }

    processingRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setError('');
    }
    await stopScanner();

    try {
      const verification = verifyReceiptAuthenticity(payload, {
        competition: competitionRef.current,
        registrations: registrationsRef.current,
      });
      if (!mountedRef.current) return;
      setResult(verification);
      setPhase('result');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Impossible de vérifier ce reçu.');
      setScanSession((v) => v + 1);
    } finally {
      if (mountedRef.current) setLoading(false);
      processingRef.current = false;
    }
  }, [stopScanner]);

  useEffect(() => {
    if (phase !== 'scanning') return undefined;

    let cancelled = false;
    setCameraReady(false);
    setError('');

    const startScanner = async () => {
      if (startingRef.current || scannerRef.current?.isScanning) return;
      startingRef.current = true;

      // Laisse le modal peindre le conteneur avant d’attacher le flux caméra
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (cancelled || !mountedRef.current) {
        startingRef.current = false;
        return;
      }

      const host = document.getElementById(SCANNER_ID);
      if (!host) {
        startingRef.current = false;
        if (!cancelled) setError('Zone de lecture indisponible.');
        return;
      }

      // Conteneur stable : dimensions fixes avant Html5Qrcode
      host.innerHTML = '';
      host.style.width = '100%';
      host.style.maxWidth = '420px';
      host.style.height = '320px';
      host.style.minHeight = '320px';

      await stopScanner();
      if (cancelled) {
        startingRef.current = false;
        return;
      }

      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: FIXED_QR_BOX,
        aspectRatio: 1,
        disableFlip: false,
        videoConstraints: isMobile
          ? { facingMode: { ideal: preferredFacing } }
          : { facingMode: 'user' },
      };

      const onScan = (text) => {
        if (!cancelled && !processingRef.current) processQrText(text);
      };

      try {
        let startTarget;
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cancelled) return;
          if (isMobile) {
            startTarget = getCameraStartTarget(cameras, preferredFacing);
          } else {
            const desktopCamera = pickDesktopCamera(cameras);
            startTarget = desktopCamera?.id || { facingMode: 'user' };
          }
        } catch {
          startTarget = isMobile
            ? { facingMode: preferredFacing }
            : { facingMode: 'user' };
        }

        await scanner.start(startTarget, config, onScan, () => {});
        if (cancelled) {
          await stopScanner();
          return;
        }
        if (mountedRef.current) setCameraReady(true);
      } catch {
        // Fallback facingMode seul si l’id caméra échoue
        try {
          if (cancelled || !scannerRef.current) return;
          await scanner.start(
            { facingMode: isMobile ? preferredFacing : 'user' },
            {
              fps: 10,
              qrbox: FIXED_QR_BOX,
              aspectRatio: 1,
              disableFlip: false,
            },
            onScan,
            () => {}
          );
          if (!cancelled && mountedRef.current) setCameraReady(true);
        } catch {
          if (!cancelled && mountedRef.current) {
            setError('Impossible d\'accéder à la caméra. Autorisez l\'accès dans le navigateur.');
          }
        }
      } finally {
        startingRef.current = false;
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // Intentionnel : ne pas dépendre de competition/registrations (polling live).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, scanSession, preferredFacing, isMobile, processQrText, stopScanner]);

  const handleScanAgain = () => {
    processingRef.current = false;
    lastScanRef.current = { text: '', at: 0 };
    setResult(null);
    setError('');
    setPhase('scanning');
    setScanSession((v) => v + 1);
  };

  const handleFacingChange = (facing) => {
    if (facing === preferredFacing || loading) return;
    setPreferredFacing(facing);
    setScanSession((v) => v + 1);
  };

  const authentic = result?.authentic;
  const payload = result?.payload;
  const title = phase === 'result'
    ? (authentic ? 'Reçu authentique' : 'Reçu non valide')
    : 'Scan reçu de paiement';

  return (
    <div className="card-overlay" onClick={onClose}>
      <div
        className={`qr-scan-modal receipt-scan-modal ${phase === 'result' ? 'qr-scan-modal-found' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`qr-scan-header ${authentic ? 'qr-scan-header-success' : ''}`}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        {phase === 'scanning' && (
          <div className="qr-scan-body receipt-scan-body">
            {isMobile && (
              <div className="qr-scan-camera-switch" role="group" aria-label="Choisir la caméra">
                <button
                  type="button"
                  className={`qr-scan-camera-btn ${preferredFacing === 'environment' ? 'active' : ''}`}
                  onClick={() => handleFacingChange('environment')}
                  disabled={loading}
                >
                  Caméra arrière
                </button>
                <button
                  type="button"
                  className={`qr-scan-camera-btn ${preferredFacing === 'user' ? 'active' : ''}`}
                  onClick={() => handleFacingChange('user')}
                  disabled={loading}
                >
                  Caméra avant
                </button>
              </div>
            )}

            <div id={SCANNER_ID} className="qr-scan-reader receipt-scan-reader" />
            {!cameraReady && !error && (
              <p className="qr-scan-status">Ouverture de la caméra…</p>
            )}
            {loading && <p className="qr-scan-status">Vérification du reçu…</p>}
            {error && <p className="qr-scan-error">{error}</p>}
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
