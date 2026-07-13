import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { calcAge, formatDate, getCardValidityYear, resolveJudokaFromQrPayload, resolveMediaUrl } from '../api';
import {
  getCameraDisplayName,
  getCameraStartTarget,
  isMobileDevice,
  pickDesktopCamera,
} from '../utils/cameraDevices';
import { hasResolvableQrPayload, parseCardQr } from '../utils/parseCardQr';

const SCANNER_ID = 'fenacoju-qr-reader';
const SCAN_DEBOUNCE_MS = 1200;

function getQrBoxSize(viewfinderWidth, viewfinderHeight) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.floor(minEdge * 0.72);
  return { width: size, height: size };
}

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

function QrPayloadPreview({ payload }) {
  const items = [
    { label: 'N° Carte', value: payload.carte },
    { label: 'Nom', value: payload.nom },
    { label: 'Prénom', value: payload.prenom },
    { label: 'Club', value: payload.club },
  ].filter((item) => item.value);

  if (items.length === 0) return null;

  return (
    <div className="qr-scan-payload-preview">
      <p className="qr-scan-payload-title">Informations lues dans le QR Code</p>
      <div className="qr-scan-details-grid">
        {items.map((item) => (
          <div key={item.label} className="qr-scan-detail-item">
            <span className="qr-scan-detail-label">{item.label}</span>
            <span className="qr-scan-detail-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QrScanModal({ onClose }) {
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef({ text: '', at: 0 });
  const fileInputRef = useRef(null);
  const [phase, setPhase] = useState('scanning');
  const [scanSession, setScanSession] = useState(0);
  const [judoka, setJudoka] = useState(null);
  const [qrPayload, setQrPayload] = useState(null);
  const [notFoundMessage, setNotFoundMessage] = useState('');
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
      // Scanner déjà arrêté
    }
    try {
      scanner.clear();
    } catch {
      // Zone déjà nettoyée
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

    const payload = parseCardQr(text);
    if (!payload || !hasResolvableQrPayload(payload)) {
      setError('QR Code non reconnu. Utilisez une carte judoka FENACOJU.');
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setError('');
    setQrPayload(payload);
    await stopScanner();

    try {
      const data = await resolveJudokaFromQrPayload(payload);
      setJudoka(data);
      setPhase('result');
    } catch (err) {
      if (err.status === 404) {
        setNotFoundMessage('Ce QR Code n\'est pas enregistré dans le système.');
        setPhase('not_found');
      } else if (err.status === 403) {
        setNotFoundMessage('Ce judoka existe dans le système mais vous n\'avez pas accès à sa fiche.');
        setPhase('not_found');
      } else {
        setError(err.message || 'Impossible de vérifier ce QR Code.');
        setScanSession((value) => value + 1);
      }
      setJudoka(null);
    } finally {
      setLoading(false);
      processingRef.current = false;
    }
  }, [stopScanner]);

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
          setError('Impossible d\'accéder à la caméra. Autorisez l\'accès, utilisez HTTPS ou importez une photo du QR.');
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
    setJudoka(null);
    setQrPayload(null);
    setNotFoundMessage('');
    setError('');
    setPhase('scanning');
    setScanSession((value) => value + 1);
  };

  const handleFacingChange = (facing) => {
    if (facing === preferredFacing) return;
    setPreferredFacing(facing);
    setScanSession((value) => value + 1);
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

  const title = phase === 'result'
    ? 'Carte trouvée'
    : phase === 'not_found'
      ? 'Carte non enregistrée'
      : 'Scanner une carte';

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="qr-scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scan-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>

        {phase === 'scanning' && (
          <div className="qr-scan-body">
            <p className="qr-scan-hint">
              {isMobile
                ? 'Placez le QR Code devant la caméra. Choisissez la caméra avant ou arrière ci-dessous.'
                : 'Placez le QR Code devant votre webcam. La caméra est détectée automatiquement.'}
            </p>

            {mobileCameraSwitchEnabled && (
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

            {!isMobile && activeCameraLabel && cameraReady && (
              <p className="qr-scan-camera-info">
                Caméra active : {activeCameraLabel}
              </p>
            )}

            <div id={SCANNER_ID} className="qr-scan-reader" />
            {!cameraReady && !error && (
              <p className="qr-scan-status">Initialisation de la caméra...</p>
            )}
            {loading && <p className="qr-scan-status">Vérification dans le système...</p>}
            {error && <p className="qr-scan-error">{error}</p>}
            <div className="qr-scan-file-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture={isMobile ? 'environment' : undefined}
                className="qr-scan-file-input"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Importer une photo du QR
              </button>
            </div>
          </div>
        )}

        {phase === 'result' && judoka && (
          <div className="qr-scan-result qr-scan-result-only-info">
            <p className="qr-scan-success-banner">Ce judoka est enregistré dans FENACOJU Base.</p>
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
        )}

        {phase === 'not_found' && (
          <div className="qr-scan-not-found">
            <p className="qr-scan-not-found-message">
              {notFoundMessage || 'Ce QR Code n\'est pas enregistré dans le système.'}
            </p>
            {qrPayload && <QrPayloadPreview payload={qrPayload} />}
            <div className="qr-scan-result-actions">
              <button type="button" className="btn btn-primary" onClick={handleScanAgain}>
                Scanner un autre QR
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
