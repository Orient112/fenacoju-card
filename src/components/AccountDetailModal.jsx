import { ACCOUNT_STATUT_LABELS, USER_TYPES, resolveMediaUrl } from '../api';

function Field({ label, value }) {
  return (
    <div className="club-detail-item">
      <span className="club-detail-label">{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

export default function AccountDetailModal({ account, onClose }) {
  if (!account) return null;

  const isArbitre = account._kind === 'arbitre' || (!account.type && account.niveau);
  const typeLabel = isArbitre
    ? 'Arbitre'
    : (USER_TYPES[account.type]?.label || account.type);
  const statut = account.statut || 'actif';
  const title = isArbitre
    ? `${account.prenom || ''} ${account.nom || ''}`.trim() || 'Arbitre'
    : account.type === 'club'
      ? account.nom_club
      : account.type === 'ligue' || account.type === 'entente'
        ? (account.nom_organisation || account.nom)
        : `${account.prenom || ''} ${account.nom || ''}`.trim() || typeLabel;

  const documents = account.documents || {};

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="club-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="club-detail-header">
          <div>
            <h2>{title}</h2>
            <p className="club-detail-value" style={{ margin: '0.25rem 0 0' }}>
              {typeLabel}
              {!isArbitre && (
                <>
                  {' · '}
                  <span className={`badge ${statut === 'pending' ? 'badge-pending' : statut === 'rejete' ? 'badge-inactif' : 'badge-actif'}`}>
                    {ACCOUNT_STATUT_LABELS[statut] || statut}
                  </span>
                </>
              )}
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
        </div>

        <div className="club-detail-body">
          <div className="club-detail-grid">
            {isArbitre && (
              <>
                <Field label="Nom" value={account.nom} />
                <Field label="Prénom" value={account.prenom} />
                <Field label="Niveau" value={account.niveau} />
                <Field label="Club" value={account.club} />
                <Field label="Grade" value={account.grade} />
                <Field label="Email" value={account.email} />
                <Field label="Téléphone" value={account.telephone} />
                <Field
                  label="Date d'enregistrement"
                  value={account.created_at ? new Date(account.created_at).toLocaleDateString('fr-FR') : ''}
                />
              </>
            )}

            {!isArbitre && (
              <>
                {(account.type === 'federation' || account.type === 'membre' || account.type === 'entraineur') && (
                  <>
                    <Field label="Nom" value={account.nom} />
                    <Field label="Prénom" value={account.prenom} />
                  </>
                )}
                {(account.type === 'ligue' || account.type === 'entente') && (
                  <>
                    <Field label="Organisation" value={account.nom_organisation || account.nom} />
                    <Field label="Responsable" value={account.responsable} />
                    <Field label="Province / Ville" value={account.ville} />
                  </>
                )}
                {account.type === 'club' && (
                  <>
                    <Field label="Nom du club" value={account.nom_club} />
                    <Field label="Responsable" value={account.responsable} />
                    <Field label="Province / Ville" value={account.ville} />
                  </>
                )}
                {account.type === 'entraineur' && (
                  <>
                    <Field label="Club" value={account.club} />
                    <Field label="Grade" value={account.grade} />
                  </>
                )}
                {(account.type === 'federation' || account.type === 'membre') && (
                  <Field label={account.type === 'membre' ? 'Rôle' : 'Fonction'} value={account.fonction} />
                )}
                <Field
                  label="Email / Identifiant"
                  value={account.email?.endsWith('@fiche.local') ? '—' : account.email}
                />
                <Field label="Téléphone" value={account.telephone} />
                <Field
                  label="Date d'enregistrement"
                  value={account.created_at ? new Date(account.created_at).toLocaleDateString('fr-FR') : ''}
                />
              </>
            )}
          </div>

          {!isArbitre && account.type === 'club' && Object.keys(documents).length > 0 && (
            <div className="club-detail-section">
              <h3>Documents</h3>
              <ul className="club-documents-list">
                {Object.entries(documents).map(([key, url]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Voir
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
