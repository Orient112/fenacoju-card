import { ACCOUNT_STATUT_LABELS, CLUB_DOCUMENT_LABELS, resolveMediaUrl } from '../api';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'CL';
  return parts.map((p) => p[0]).join('').toUpperCase();
}

export default function ClubDetailModal({ club, judokas = [], entraineurs = [], onClose }) {
  if (!club) return null;

  const documents = club.documents || {};
  const docEntries = Object.entries(documents).filter(([, url]) => url);
  const comites = Array.isArray(club.comites) ? club.comites : [];
  const statut = club.statut || 'actif';
  const statutLabel = ACCOUNT_STATUT_LABELS[statut] || statut;

  return (
    <div className="card-overlay" onClick={onClose}>
      <div className="club-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="club-sheet-hero">
          <div className="club-sheet-hero-main">
            <div className="club-sheet-avatar" aria-hidden="true">{initials(club.nom_club)}</div>
            <div>
              <p className="club-sheet-kicker">Club affilié FENACOJU</p>
              <h2>{club.nom_club}</h2>
              <p className="club-sheet-lead">{club.responsable || 'Responsable non renseigné'}</p>
            </div>
          </div>
          <div className="club-sheet-hero-side">
            <span className={`club-sheet-status club-sheet-status-${statut}`}>{statutLabel}</span>
            <button type="button" className="club-sheet-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>

        <div className="club-sheet-body">
          <div className="club-sheet-metrics">
            <div className="club-sheet-metric">
              <strong>{judokas.length}</strong>
              <span>Judokas</span>
            </div>
            <div className="club-sheet-metric">
              <strong>{entraineurs.length}</strong>
              <span>Entraîneurs</span>
            </div>
            <div className="club-sheet-metric">
              <strong>{comites.length}</strong>
              <span>Comités</span>
            </div>
            <div className="club-sheet-metric">
              <strong>{docEntries.length}</strong>
              <span>Documents</span>
            </div>
          </div>

          <div className="club-sheet-info-grid">
            <div className="club-sheet-info-card">
              <span>Province / Ville</span>
              <strong>{club.ville || '—'}</strong>
            </div>
            <div className="club-sheet-info-card">
              <span>Identifiant</span>
              <strong>{club.email || '—'}</strong>
            </div>
            <div className="club-sheet-info-card">
              <span>Téléphone</span>
              <strong>{club.telephone || '—'}</strong>
            </div>
            <div className="club-sheet-info-card">
              <span>Enregistré le</span>
              <strong>{club.created_at ? new Date(club.created_at).toLocaleDateString('fr-FR') : '—'}</strong>
            </div>
          </div>

          <section className="club-sheet-section">
            <h3>Comités</h3>
            {comites.length === 0 ? (
              <p className="club-sheet-empty">Aucun comité enregistré</p>
            ) : (
              <ul className="club-sheet-chips">
                {comites.map((c, idx) => (
                  <li key={`comite-${idx}`}>
                    <strong>{c.nom || '—'}</strong>
                    {c.titre ? <span>{c.titre}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="club-sheet-section">
            <h3>Documents</h3>
            {docEntries.length === 0 ? (
              <p className="club-sheet-empty">Aucun document enregistré</p>
            ) : (
              <ul className="club-sheet-docs">
                {docEntries.map(([key, url]) => (
                  <li key={key}>
                    <span>{CLUB_DOCUMENT_LABELS[key] || key}</span>
                    <a href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Ouvrir
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="club-sheet-section">
            <h3>Entraîneurs</h3>
            {entraineurs.length === 0 ? (
              <p className="club-sheet-empty">Aucun entraîneur enregistré pour ce club</p>
            ) : (
              <ul className="club-sheet-people">
                {entraineurs.map((e) => (
                  <li key={e.id}>
                    <div className="club-sheet-person-avatar">{initials(`${e.prenom} ${e.nom}`)}</div>
                    <div>
                      <strong>{e.prenom} {e.nom}</strong>
                      <span>{e.grade || 'Entraîneur'}{e.telephone ? ` · ${e.telephone}` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="club-sheet-section">
            <h3>Judokas</h3>
            {judokas.length === 0 ? (
              <p className="club-sheet-empty">Aucun judoka enregistré pour ce club</p>
            ) : (
              <div className="club-sheet-table-wrap">
                <table className="club-sheet-table">
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
                        <td><span className="club-sheet-grade">{j.grade}</span></td>
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
          </section>
        </div>
      </div>
    </div>
  );
}
