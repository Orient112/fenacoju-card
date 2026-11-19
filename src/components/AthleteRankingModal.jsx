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

  const standings = data?.competition_standings || [];
  const bestResults = data?.best_results || [];

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
            {data?.season_label ? (
              <p className="form-hint">{data.season_label}</p>
            ) : null}
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
              <div className="login-id-classement-cell">
                <span>Classement</span>
                {standings.length > 0 ? (
                  <ul className="login-id-classement-list">
                    {standings.map((r) => (
                      <li key={r.id || `${r.competition_name}-${r.place}`}>
                        <em>{r.competition_name || 'Compétition'}</em>
                        <strong>
                          {Number(r.place) > 0 ? r.place : '-'}
                          {' / '}
                          {Number(r.field_size) > 0 ? r.field_size : '-'}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <strong>
                    {data.rank ? data.rank : '-'}
                    {' / '}
                    {data.category_size ? data.category_size : '-'}
                  </strong>
                )}
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
                  {(data.judoka?.sexe || judoka?.sexe || '').toString().toUpperCase().startsWith('F') ? 'F' : 'M'}
                  {' · '}
                  {data.categorie_poids || data.judoka?.categorie || judoka?.categorie || '-'}
                </strong>
              </div>
              <div>
                <span>Médailles d&apos;or</span>
                <strong>{data.gold_medals || 0}</strong>
              </div>
            </div>

            <section>
              <h4>Meilleures performances</h4>
              {bestResults.length === 0 ? (
                <p className="form-hint">Aucun résultat Ranking pour cet athlète.</p>
              ) : (
                <ul className="athlete-ranking-results">
                  {bestResults.map((r) => (
                    <li key={r.id || `${r.competition_name}-${r.place}-${r.points}`}>
                      <strong>{r.competition_name}</strong>
                      <small>
                        Niveau {r.competition_level}
                        {' · '}
                        Place{' '}
                        {Number(r.place) > 0 ? r.place : 'participation'}
                        {Number(r.field_size) > 0 ? ` / ${r.field_size}` : ''}
                        {' · '}
                        {r.points} pts
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
