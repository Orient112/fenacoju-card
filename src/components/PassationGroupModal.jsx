export default function PassationGroupModal({ group, onClose }) {
  if (!group) return null;

  const athletes = group.athletes || [];

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="transfer-modal passation-group-modal" onClick={(e) => e.stopPropagation()}>
        <header className="competition-params-modal-head">
          <div>
            <h3>Groupe de passation</h3>
            <p className="form-hint">
              Instructeur : <strong>{group.instructeur_nom || '-'}</strong>
              {group.created_at ? ` · ${new Date(group.created_at).toLocaleString('fr-FR')}` : ''}
            </p>
            <p className="form-hint">
              {athletes.length} athlète{athletes.length > 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        {athletes.length === 0 ? (
          <p className="form-hint">Aucun résultat enregistré pour ce groupe.</p>
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
                  <p className="form-hint">
                    {a.grade_from || '-'} → {a.grade_to || '-'}
                    {a.total_score != null && a.total_max != null
                      ? ` · Points : ${a.total_score}/${a.total_max}`
                      : a.total_score != null
                        ? ` · Points : ${a.total_score}`
                        : ''}
                  </p>
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
  );
}
