import { formatDate } from '../api';

export default function JudokaList({ judokas, onViewCard, onEdit, onDelete, onAddNew }) {
  if (judokas.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🥋</div>
        <h3>Aucun judoka trouvé</h3>
        <p>Aucun judoka dans votre périmètre d'accès.</p>
        {onAddNew && (
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={onAddNew}>
            Enregistrer un judoka
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>N° Carte</th>
          <th>Nom</th>
          <th>Club</th>
          <th>Grade</th>
          <th>Catégorie</th>
          <th>Inscription</th>
          <th>Statut</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {judokas.map((j) => (
          <tr key={j.id}>
            <td data-label="N° Carte">
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>
                {j.numero_carte}
              </span>
            </td>
            <td data-label="Nom">
              <div className="judoka-name">{j.nom} {j.prenom}</div>
              <div className="judoka-club">{j.sexe === 'M' ? '♂' : '♀'} — {formatDate(j.date_naissance)}</div>
            </td>
            <td data-label="Club">{j.club}</td>
            <td data-label="Grade"><span className="badge grade-badge">{j.grade}</span></td>
            <td data-label="Catégorie">{j.categorie || '—'}</td>
            <td data-label="Inscription">{formatDate(j.date_inscription)}</td>
            <td data-label="Statut">
              <span className={`badge badge-${j.statut}`}>
                {j.statut === 'actif' ? 'Actif' : 'Inactif'}
              </span>
            </td>
            <td data-label="Actions">
              <div className="actions-cell">
                {onViewCard && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm btn-icon"
                    onClick={() => onViewCard(j)}
                    title="Voir la carte"
                  >
                    🪪
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    onClick={() => onEdit(j)}
                    title="Modifier"
                  >
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm btn-icon"
                    onClick={() => onDelete(j)}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
