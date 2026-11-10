export default function PassationGroupModal({ group, onClose }) {
  if (!group) return null;

  const athletes = group.athletes || [];
  const passedCount = athletes.filter((a) => a.reussi).length;
  const rejectedCount = athletes.length - passedCount;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="transfer-modal passation-group-modal" onClick={(e) => e.stopPropagation()}>
        <header className="passation-group-modal-head">
          <div>
            <p className="passation-group-kicker">Ceinture noire</p>
            <h3>Groupe de passation</h3>
            <p className="passation-group-subtitle">
              Instructeur : <strong>{group.instructeur_nom || '-'}</strong>
              {group.created_at ? ` · ${new Date(group.created_at).toLocaleString('fr-FR')}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="passation-group-modal-body">
          <div className="passation-group-summary">
            <div className="passation-group-stat">
              <strong>{athletes.length}</strong>
              <span>Athlète{athletes.length > 1 ? 's' : ''}</span>
            </div>
            <div className="passation-group-stat is-pass">
              <strong>{passedCount}</strong>
              <span>Passer</span>
            </div>
            <div className="passation-group-stat is-reject">
              <strong>{rejectedCount}</strong>
              <span>Rejeter</span>
            </div>
          </div>

          {athletes.length === 0 ? (
            <div className="passation-group-empty">Aucun résultat enregistré pour ce groupe.</div>
          ) : (
            <ul className="passation-group-list">
              {athletes.map((a) => (
                <li key={a.id || `${a.judoka_id}-${a.graded_at}`} className="passation-group-item">
                  <div className="passation-group-item-main">
                    <strong>
                      {a.judoka_prenom} {a.judoka_nom}
                    </strong>
                    <small>
                      Club : {a.club || '-'}
                      {a.judoka_numero_carte ? ` · ID ${a.judoka_numero_carte}` : ''}
                    </small>
                    <div className="passation-group-item-meta">
                      <span className="passation-group-grade-chip">
                        {a.grade_from || '-'} → {a.grade_to || '-'}
                      </span>
                      {a.total_score != null && a.total_max != null ? (
                        <span>Points : {a.total_score}/{a.total_max}</span>
                      ) : a.total_score != null ? (
                        <span>Points : {a.total_score}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className={`passation-result-badge ${a.reussi ? 'is-pass' : 'is-reject'}`}>
                    {a.reussi ? 'Passer' : 'Rejeter'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
