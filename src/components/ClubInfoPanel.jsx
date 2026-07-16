export default function ClubInfoPanel({
  title,
  responsable,
  ville,
  responsableLabel = 'Responsable du club',
  villeLabel = 'Province / Ville',
}) {
  return (
    <div className="club-info-panel">
      <h2>{title}</h2>
      <div className="club-info-grid">
        <div className="club-info-item">
          <span className="club-info-label">{responsableLabel}</span>
          <span className="club-info-value">{responsable || '—'}</span>
        </div>
        <div className="club-info-item">
          <span className="club-info-label">{villeLabel}</span>
          <span className="club-info-value">{ville || '—'}</span>
        </div>
      </div>
    </div>
  );
}
