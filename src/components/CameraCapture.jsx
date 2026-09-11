import { useRef, useEffect, useState } from 'react';

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

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: facingMode === 'environment' ? 1920 : 640 },
            height: { ideal: facingMode === 'environment' ? 1080 : 480 },
          },
          audio: false,
        };
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      } catch {
        setError('Impossible d\'accéder à la caméra. Vérifiez les autorisations.');
      }
    }

    startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="camera-overlay" onClick={onClose}>
      <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {error ? (
          <p className="camera-error">{error}</p>
        ) : (
          <div className="camera-viewport">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          </div>
        )}
        <div className="camera-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleCapture} disabled={!ready || !!error}>
            {captureLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
