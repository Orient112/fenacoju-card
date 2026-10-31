export default function BrandLoader({ label = '', fullscreen = false }) {
  return (
    <div className={`page-loader ${fullscreen ? 'page-loader-fullscreen' : ''}`}>
      <div className="brand-loader" aria-hidden="true">
        <span className="brand-loader-ring" />
        <img src="/fenacoju-logo.png" alt="" className="brand-loader-logo" />
      </div>
      {label ? <p className="brand-loader-label">{label}</p> : null}
    </div>
  );
}
