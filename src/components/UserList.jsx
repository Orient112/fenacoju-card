import { USER_TYPES, ACCOUNT_STATUT_LABELS } from '../api';

function displayName(u) {
  if (u.type === 'club') return u.nom_club;
  if (u.type === 'ligue' || u.type === 'entente') {
    return u.nom_organisation || u.nom || u.responsable;
  }
  return `${u.prenom || ''} ${u.nom || ''}`.trim() || u.responsable;
}

function statutClass(statut) {
  if (statut === 'pending') return 'badge-pending';
  if (statut === 'rejete') return 'badge-inactif';
  return 'badge-actif';
}

export default function UserList({
  users,
  showClub = false,
  canManage = false,
  canValidate = false,
  detailColumnLabel = 'Détails',
  hideFonctionUnderName = false,
  showViewAction = false,
  onEdit,
  onDelete,
  onResetPassword,
  onView,
  onValidate,
  onReject,
}) {
  if (users.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">👤</div>
        <h3>Aucun membre trouvé</h3>
        <p>Aucun utilisateur dans cette catégorie.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Nom</th>
          {showClub && <th>Club</th>}
          <th>Email / Identifiant</th>
          <th>Téléphone</th>
          <th>Statut</th>
          <th>{detailColumnLabel}</th>
          {(canManage || showViewAction || canValidate) && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const statut = u.statut || 'actif';
          const needsValidation = ['ligue', 'entente', 'club'].includes(u.type) && statut === 'pending';
          return (
            <tr key={u.id} className={needsValidation ? 'row-pending' : undefined}>
              <td data-label="Type">
                <span className="badge grade-badge">
                  {USER_TYPES[u.type]?.label || u.type}
                </span>
              </td>
              <td data-label="Nom">
                <div className="judoka-name">{displayName(u)}</div>
                {u.fonction && !hideFonctionUnderName && (
                  <div className="judoka-club">{u.fonction}</div>
                )}
              </td>
              {showClub && <td data-label="Club">{u.club || u.nom_club || '—'}</td>}
              <td data-label="Email">{u.email}</td>
              <td data-label="Téléphone">{u.telephone || '—'}</td>
              <td data-label="Statut">
                <span className={`badge ${statutClass(statut)}`}>
                  {ACCOUNT_STATUT_LABELS[statut] || statut}
                </span>
              </td>
              <td data-label={detailColumnLabel}>
                {u.type === 'entraineur' && u.grade && (
                  <span className="badge badge-actif">{u.grade}</span>
                )}
                {(u.type === 'club' || u.type === 'ligue' || u.type === 'entente') && u.ville && (
                  <span className="judoka-club">{u.ville}</span>
                )}
                {u.type === 'federation' && u.fonction && (
                  <span className="badge badge-actif">{u.fonction}</span>
                )}
              </td>
              {(canManage || showViewAction || canValidate) && (
                <td data-label="Actions">
                  <div className="actions-cell">
                    {showViewAction && u.type === 'club' && onView && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        onClick={() => onView(u)}
                        title="Voir les détails du club"
                      >
                        👁️
                      </button>
                    )}
                    {canValidate && needsValidation && onValidate && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onValidate(u)}
                        title="Valider le compte"
                      >
                        Valider
                      </button>
                    )}
                    {canValidate && needsValidation && onReject && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => onReject(u)}
                        title="Rejeter le compte"
                      >
                        Rejeter
                      </button>
                    )}
                    {canManage && u.type !== 'admin' && onEdit && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        onClick={() => onEdit(u)}
                        title="Modifier"
                      >
                        ✏️
                      </button>
                    )}
                  {u.type !== 'admin' && u.acces_systeme !== false && u.type !== 'entraineur' && u.type !== 'membre' && onResetPassword && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-icon"
                      onClick={() => onResetPassword(u)}
                      title="Réinitialiser mot de passe"
                    >
                      🔑
                    </button>
                  )}
                    {canManage && u.type !== 'admin' && onDelete && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm btn-icon"
                        onClick={() => onDelete(u)}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
