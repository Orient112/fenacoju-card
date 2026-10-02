import { formatDate } from '../api';
import { IconCard, IconEdit, IconEye, IconGrade, IconTrash } from './ActionIcons';

export default function JudokaList({ judokas, onViewCard, onEdit, onDelete, onPromoteGrade, onAddNew, showActions = true }) {
  const hasActions = showActions && (onViewCard || onEdit || onDelete || onPromoteGrade);

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
          {hasActions && <th>Actions</th>}
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
            {hasActions && (
              <td data-label="Actions">
                <div className="actions-cell">
                  {onViewCard && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-card"
                      onClick={() => onViewCard(j)}
                      title="Voir la carte"
                    >
                      <IconCard />
                    </button>
                  )}
                  {onPromoteGrade && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-grade"
                      onClick={() => onPromoteGrade(j)}
                      title="Passation de grade"
                    >
                      <IconGrade />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-edit"
                      onClick={() => onEdit(j)}
                      title="Modifier"
                    >
                      <IconEdit />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-delete"
                      onClick={() => onDelete(j)}
                      title="Supprimer"
                    >
                      <IconTrash />
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
