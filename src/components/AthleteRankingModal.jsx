import { useEffect, useState } from 'react';
import BrandLoader from './BrandLoader';
import { fetchAthleteRanking } from '../api';

export default function AthleteRankingModal({ judoka, onClose, onToast }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!judoka?.id) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchAthleteRanking(judoka.id);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Chargement impossible');
          onToast?.(err.message || 'Chargement impossible', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [judoka?.id, onToast]);

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="athlete-ranking-modal" onClick={(e) => e.stopPropagation()}>
        <header className="athlete-ranking-head">
          <div>
            <p className="sa-kicker">Ranking</p>
            <h3>
              {judoka?.prenom} {judoka?.nom}
            </h3>
            <p className="form-hint">
              {judoka?.club || '-'}
              {judoka?.categorie ? ` · ${judoka.categorie}` : ''}
              {judoka?.numero_carte ? ` · ${judoka.numero_carte}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>Fermer</button>
        </header>

        {loading ? (
          <BrandLoader label="Chargement du classement…" />
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : data ? (
          <div className="athlete-ranking-body">
            <div className="athlete-ranking-stats">
              <div>
                <span>Classement</span>
                <strong>
                  {data.rank ? `#${data.rank}` : '-'}
                  {data.category_size ? ` / ${data.category_size}` : ''}
                </strong>
              </div>
              <div>
                <span>Points</span>
                <strong>{data.points || 0}</strong>
              </div>
              <div>
                <span>Catégorie</span>
                <strong>
                  {data.categorie_age || 'Seniors'}
                  {' · '}
                  {data.judoka?.sexe === 'F' ? 'F' : 'M'}
                  {' · '}
                  {data.categorie_poids || data.judoka?.categorie || '-'}
                </strong>
              </div>
              <div>
                <span>Saison</span>
                <strong>{data.season_label || '-'}</strong>
              </div>
            </div>

            <section>
              <h4>Meilleures performances</h4>
              {(data.best_results || []).length === 0 ? (
                <p className="form-hint">Aucun résultat Ranking pour cet athlète.</p>
              ) : (
                <ul className="athlete-ranking-results">
                  {data.best_results.map((r) => (
                    <li key={r.id}>
                      <strong>{r.competition_name}</strong>
                      <small>
                        Niveau {r.competition_level}
                        {' · '}
                        Place {r.place || 'participation'}
                        {' · '}
                        {r.points} pts
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4>Top catégorie de poids</h4>
              {(data.category_board || []).length === 0 ? (
                <p className="form-hint">Pas encore de classement dans cette catégorie.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Athlète</th>
                      <th>Club</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.category_board.map((row) => (
                      <tr key={`${row.rank}-${row.nom}-${row.prenom}`} className={row.judoka_id === judoka.id ? 'is-self' : ''}>
                        <td>{row.rank}</td>
                        <td>{row.prenom} {row.nom}</td>
                        <td>{row.club || '-'}</td>
                        <td><strong>{row.points}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
