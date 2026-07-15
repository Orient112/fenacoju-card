export default function ArbitreList({ arbitres, canManage = false, onEdit, onDelete, onAddNew }) {
  if (arbitres.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🧑‍⚖️</div>
        <h3>Aucun arbitre trouvé</h3>
        <p>Aucun arbitre dans votre périmètre.</p>
        {onAddNew && (
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={onAddNew}>
            Nouvel arbitre
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Niveau</th>
          <th>Club</th>
          <th>Grade</th>
          <th>Téléphone</th>
          {canManage && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {arbitres.map((a) => (
          <tr key={a.id}>
            <td data-label="Nom">
              <div className="judoka-name">{a.prenom} {a.nom}</div>
              {a.email && <div className="judoka-club">{a.email}</div>}
            </td>
            <td data-label="Niveau">
              <span className="badge grade-badge">{a.niveau}</span>
            </td>
            <td data-label="Club">{a.club || '—'}</td>
            <td data-label="Grade">{a.grade || '—'}</td>
            <td data-label="Téléphone">{a.telephone || '—'}</td>
            {canManage && (
              <td data-label="Actions">
                <div className="actions-cell">
                  {onEdit && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-icon"
                      onClick={() => onEdit(a)}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm btn-icon"
                      onClick={() => onDelete(a)}
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
