import { useRef } from 'react';
import CameraCapture from './CameraCapture';

export default function DocumentUploadField({ label, file, preview, onFileChange, onClear, showCamera, onToggleCamera, onCameraCapture }) {
  const fileRef = useRef(null);
  const scanRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) onFileChange(f);
    e.target.value = '';
  };

  const isImage = preview && !preview.endsWith('.pdf') && file?.type !== 'application/pdf';

  return (
    <div className="form-group full-width document-upload-field">
      <label>{label}</label>

      {preview && (
        <div className="document-preview-wrap">
          {isImage ? (
            <img src={preview} alt="Aperçu document" className="document-preview-img" />
          ) : (
            <div className="document-preview-file">📄 Document chargé</div>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
            Supprimer
          </button>
        </div>
      )}

      {!preview && (
        <>
          <div className="photo-options document-options">
            <div className="photo-option">
              <div className="photo-option-icon file-icon" />
              <h4>Depuis l'ordinateur</h4>
              <p>JPG, PNG, PDF — max 10 Mo</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFile}
                className="photo-option-input"
              />
              <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
                Parcourir les fichiers
              </button>
            </div>

            <div className="photo-option">
              <div className="photo-option-icon camera-icon" />
              <h4>Scanner / Photographier</h4>
              <p>Utiliser la webcam ou scanner le document</p>
              <input
                ref={scanRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                className="photo-option-input"
              />
              <div className="photo-option-actions">
                <button type="button" className="btn btn-primary" onClick={onToggleCamera}>
                  Ouvrir la caméra
                </button>
                <button type="button" className="btn btn-outline" onClick={() => scanRef.current?.click()}>
                  Scanner
                </button>
              </div>
            </div>
          </div>

          {showCamera && (
            <CameraCapture onCapture={onCameraCapture} onClose={onToggleCamera} />
          )}
        </>
      )}
    </div>
  );
}
