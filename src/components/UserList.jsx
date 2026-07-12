import { USER_TYPES } from '../api';

export default function UserList({
  users,
  showClub = false,
  canManage = false,
  detailColumnLabel = 'Détails',
  hideFonctionUnderName = false,
  showViewAction = false,
  onEdit,
  onDelete,
  onResetPassword,
  onView,
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
          <th>{detailColumnLabel}</th>
          {(canManage || showViewAction) && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td data-label="Type">
              <span className="badge grade-badge">
                {USER_TYPES[u.type]?.label || u.type}
              </span>
            </td>
            <td data-label="Nom">
              <div className="judoka-name">
                {u.type === 'club'
                  ? u.nom_club
                  : `${u.prenom || ''} ${u.nom || ''}`.trim() || u.responsable}
              </div>
              {u.fonction && !hideFonctionUnderName && (
                <div className="judoka-club">{u.fonction}</div>
              )}
            </td>
            {showClub && <td data-label="Club">{u.club || u.nom_club || '—'}</td>}
            <td data-label="Email">{u.email}</td>
            <td data-label="Téléphone">{u.telephone || '—'}</td>
            <td data-label={detailColumnLabel}>
              {u.type === 'entraineur' && u.grade && (
                <span className="badge badge-actif">{u.grade}</span>
              )}
              {u.type === 'club' && u.ville && (
                <span className="judoka-club">{u.ville}</span>
              )}
              {u.type === 'federation' && u.fonction && (
                <span className="badge badge-actif">{u.fonction}</span>
              )}
            </td>
            {(canManage || showViewAction) && (
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
                  {u.type !== 'admin' && onEdit && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-icon"
                      onClick={() => onEdit(u)}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                  )}
                  {u.type !== 'admin' && onResetPassword && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-icon"
                      onClick={() => onResetPassword(u)}
                      title="Réinitialiser mot de passe"
                    >
                      🔑
                    </button>
                  )}
                  {u.type !== 'admin' && onDelete && (
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
        ))}
      </tbody>
    </table>
  );
}
