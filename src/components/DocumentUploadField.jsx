import { useRef } from 'react';
import CameraCapture from './CameraCapture';

export default function DocumentUploadField({
  label,
  file,
  preview,
  onFileChange,
  onClear,
  showCamera,
  onToggleCamera,
  onCameraCapture,
}) {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) onFileChange(f);
    e.target.value = '';
  };

  const isPdf = Boolean(
    file?.type === 'application/pdf' || (typeof preview === 'string' && preview.toLowerCase().includes('.pdf'))
  );
  const fileName = file?.name || (isPdf ? 'Document PDF' : preview ? 'Document chargé' : '');

  return (
    <div className="form-group form-group-full document-upload-field">
      <div className="document-upload-head">
        <label>{label}</label>
        <div className="document-upload-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
            Importer
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onToggleCamera}>
            Scanner
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        onChange={handleFile}
        className="photo-option-input"
      />

      {preview && (
        <div className="document-preview-wrap">
          {!isPdf && preview ? (
            <img src={preview} alt="" className="document-preview-img" />
          ) : (
            <div className="document-preview-file">📄 {fileName}</div>
          )}
          {fileName && !isPdf && file && <span className="document-file-name">{fileName}</span>}
          <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
            Supprimer
          </button>
        </div>
      )}

      {showCamera && (
        <CameraCapture
          title="Scanner le document"
          facingMode="environment"
          captureLabel="Capturer"
          onCapture={onCameraCapture}
          onClose={onToggleCamera}
        />
      )}
    </div>
  );
}
