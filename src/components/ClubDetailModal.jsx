import { resolveMediaUrl } from '../api';

const CLUB_DOCUMENT_LABELS = {
  doc_affiliation: "Document d'affiliation",
  doc_statuts: 'Statuts du club',
  doc_agrement: 'Agrément / Autorisation',
};

export default function ClubDetailModal({ club, judokas = [], entraineurs = [], onClose }) {
  if (!club) return null;

  const documents = club.documents || {};

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="club-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="club-detail-header">
          <h2>{club.nom_club}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
        </div>

        <div className="club-detail-body">
          <div className="club-detail-section">
            <h3>Responsable du club</h3>
            <p className="club-detail-value">{club.responsable || '—'}</p>
          </div>

          <div className="club-detail-grid">
            <div className="club-detail-item">
              <span className="club-detail-label">Province / Ville</span>
              <span>{club.ville || '—'}</span>
            </div>
            <div className="club-detail-item">
              <span className="club-detail-label">Email / Identifiant</span>
              <span>{club.email || '—'}</span>
            </div>
            <div className="club-detail-item">
              <span className="club-detail-label">Téléphone</span>
              <span>{club.telephone || '—'}</span>
            </div>
            <div className="club-detail-item">
              <span className="club-detail-label">Date d'enregistrement</span>
              <span>{club.created_at ? new Date(club.created_at).toLocaleDateString('fr-FR') : '—'}</span>
            </div>
          </div>

          <div className="club-detail-section">
            <h3>Documents du club</h3>
            {Object.keys(documents).length === 0 ? (
              <p className="club-detail-empty">Aucun document enregistré</p>
            ) : (
              <ul className="club-documents-list">
                {Object.entries(documents).map(([key, url]) => (
                  <li key={key}>
                    <span>{CLUB_DOCUMENT_LABELS[key] || key}</span>
                    <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Voir le document
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="club-detail-section">
            <h3>Entraîneurs ({entraineurs.length})</h3>
            {entraineurs.length === 0 ? (
              <p className="club-detail-empty">Aucun entraîneur enregistré pour ce club</p>
            ) : (
              <ul className="club-members-list">
                {entraineurs.map((e) => (
                  <li key={e.id} className="club-member-item">
                    <div>
                      <span className="club-member-name">{e.prenom} {e.nom}</span>
                      {e.grade && <span className="club-member-meta">{e.grade}</span>}
                    </div>
                    <span className="club-member-contact">{e.telephone || e.email || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="club-detail-section">
            <h3>Judokas ({judokas.length})</h3>
            {judokas.length === 0 ? (
              <p className="club-detail-empty">Aucun judoka enregistré pour ce club</p>
            ) : (
              <div className="club-judokas-table-wrap">
                <table className="club-judokas-table">
                  <thead>
                    <tr>
                      <th>N° Carte</th>
                      <th>Nom</th>
                      <th>Grade</th>
                      <th>Catégorie</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {judokas.map((j) => (
                      <tr key={j.id}>
                        <td>{j.numero_carte}</td>
                        <td>{j.prenom} {j.nom}</td>
                        <td>{j.grade}</td>
                        <td>{j.categorie || '—'}</td>
                        <td>
                          <span className={`badge badge-${j.statut}`}>
                            {j.statut === 'actif' ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
