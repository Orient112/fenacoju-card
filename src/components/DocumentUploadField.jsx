import { useRef } from 'react';
import CameraCapture from './CameraCapture';

function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

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
  const hasDocument = Boolean(preview);

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
    <div className={`document-upload-field ${hasDocument ? 'is-loaded' : ''}`}>
      <div className="document-upload-head">
        <label>{label}</label>
        {!hasDocument && (
          <div className="document-upload-actions">
            <button
              type="button"
              className="btn btn-outline btn-icon document-icon-btn"
              title="Importer"
              aria-label={`Importer ${label}`}
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-icon document-icon-btn"
              title="Scanner"
              aria-label={`Scanner ${label}`}
              onClick={onToggleCamera}
            >
              <IconScan />
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        onChange={handleFile}
        className="photo-option-input"
      />

      {hasDocument && (
        <div className="document-preview-wrap">
          {!isPdf && preview ? (
            <img src={preview} alt="" className="document-preview-img" />
          ) : (
            <div className="document-preview-file">📄 {fileName}</div>
          )}
          {fileName && !isPdf && file && <span className="document-file-name">{fileName}</span>}
          <button
            type="button"
            className="btn btn-danger btn-sm btn-icon"
            title="Supprimer"
            aria-label={`Supprimer ${label}`}
            onClick={onClear}
          >
            <IconTrash />
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
