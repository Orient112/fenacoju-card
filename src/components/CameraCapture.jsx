import { useRef, useEffect, useState, useCallback } from 'react';
import {
  findCameraByFacing,
  isMobileDevice,
} from '../utils/cameraDevices';

export default function CameraCapture({
  onCapture,
  onClose,
  title = 'Prendre une photo',
  facingMode = 'user',
  captureLabel = 'Capturer',
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const isMobile = isMobileDevice();
  const [preferredFacing, setPreferredFacing] = useState(
    isMobile && facingMode === 'user' ? 'environment' : facingMode
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      setError('');
      setReady(false);
      stopStream();

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Caméra non supportée');
        }

        // Demande une permission minimale pour pouvoir lister les périphériques
        let deviceId = null;
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d) => ({ id: d.deviceId, label: d.label || '' }));
          const match = findCameraByFacing(cameras, preferredFacing);
          if (match?.id) deviceId = match.id;
        } catch {
          /* ignore enumerate errors */
        }

        const videoConstraint = deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: preferredFacing === 'environment' ? 1920 : 1280 },
              height: { ideal: preferredFacing === 'environment' ? 1080 : 720 },
            }
          : {
              facingMode: { ideal: preferredFacing },
              width: { ideal: preferredFacing === 'environment' ? 1920 : 1280 },
              height: { ideal: preferredFacing === 'environment' ? 1080 : 720 },
            };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: preferredFacing },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            /* autoplay peut être bloqué ; playsInline suffit souvent */
          }
        }
        setReady(true);
      } catch {
        if (mounted) {
          setError('Impossible d\'accéder à la caméra. Vérifiez les autorisations.');
        }
      } finally {
        if (mounted) setSwitching(false);
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stopStream();
    };
  }, [preferredFacing, stopStream]);

  const handleFacingChange = (facing) => {
    if (facing === preferredFacing || switching) return;
    setSwitching(true);
    setPreferredFacing(facing);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);

    stopStream();
    onClose();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div className="camera-overlay" onClick={handleClose}>
      <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        {isMobile && (
          <div className="qr-scan-camera-switch camera-facing-switch" role="group" aria-label="Choisir la caméra">
            <button
              type="button"
              className={`qr-scan-camera-btn ${preferredFacing === 'environment' ? 'active' : ''}`}
              onClick={() => handleFacingChange('environment')}
              disabled={switching || !!error}
            >
              Caméra arrière
            </button>
            <button
              type="button"
              className={`qr-scan-camera-btn ${preferredFacing === 'user' ? 'active' : ''}`}
              onClick={() => handleFacingChange('user')}
              disabled={switching || !!error}
            >
              Caméra avant
            </button>
          </div>
        )}

        {error ? (
          <p className="camera-error">{error}</p>
        ) : (
          <div className="camera-viewport">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`camera-video ${preferredFacing === 'user' ? 'is-mirrored' : ''}`}
            />
            {!ready && !error && (
              <p className="camera-loading">Ouverture de la caméra…</p>
            )}
          </div>
        )}

        <div className="camera-actions">
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCapture}
            disabled={!ready || !!error || switching}
          >
            {captureLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
