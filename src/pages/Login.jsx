import { useState } from 'react';
import { loginUser, resolveMediaUrl, verifyJudokaId } from '../api';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // login | mon-id
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cardId, setCardId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [idResult, setIdResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await loginUser(identifier, password);
      onLogin({
        ...data.user,
        permissions: data.permissions,
        federation_settings: data.federation_settings,
        federation_branding: data.federation_branding,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyId = async (e) => {
    e.preventDefault();
    setError('');
    setIdResult(null);
    setLoading(true);
    try {
      const data = await verifyJudokaId(cardId.trim());
      if (!data?.found) {
        setError('Cet ID n\'est pas enregistré dans le système');
        return;
      }
      setIdResult(data);
    } catch (err) {
      setError(err.message || 'ID introuvable');
      setIdResult(null);
    } finally {
      setLoading(false);
    }
  };

  const openMonId = () => {
    setMode('mon-id');
    setError('');
    setIdResult(null);
  };

  const backToLogin = () => {
    setMode('login');
    setError('');
    setIdResult(null);
    setCardId('');
  };

  const photoUrl = idResult?.photo ? resolveMediaUrl(idResult.photo) : '';
  const ranking = idResult?.ranking || null;
  const athleteId = idResult?.id || ranking?.judoka?.id;

  return (
    <div className="login-page">
      <aside className="login-visual" aria-hidden="true">
        <img src="/login-hero.jpg" alt="" className="login-visual-img" />
        <div className="login-visual-shade" />
      </aside>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-brand">
            <img src="/fenacoju-logo.png" alt="FENACOJU" className="login-logo" />
            <h1>Fight Management</h1>
          </div>

          <p className="login-lead">
            Système intégral de gestion des arts martiaux.
          </p>

          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
              {error && <div className="form-error">{error}</div>}

              <div className="form-group">
                <label htmlFor="login-identifier">Identifiant</label>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Entrez votre identifiant"
                  required
                  autoComplete="off"
                  name="fenacoju-identifier"
                />
              </div>

              <div className="form-group">
                <label htmlFor="login-password">Mot de passe</label>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Entrez votre mot de passe"
                    required
                    autoComplete="new-password"
                    name="fenacoju-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn login-btn" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
              <button
                type="button"
                className="btn login-mon-id-btn"
                onClick={openMonId}
                disabled={loading}
              >
                Mon ID
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyId} className="login-form" autoComplete="off">
              {error && <div className="form-error">{error}</div>}

              <div className="form-group">
                <label htmlFor="login-card-id">ID unique</label>
                <input
                  id="login-card-id"
                  type="text"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  placeholder="Entrez votre n° de carte"
                  required
                  autoFocus
                  autoComplete="off"
                  name="fenacoju-card-id"
                />
              </div>

              <button type="submit" className="btn login-mon-id-btn" disabled={loading}>
                {loading ? 'Vérification…' : 'Valider'}
              </button>
              <button
                type="button"
                className="btn btn-outline login-back-btn"
                onClick={backToLogin}
                disabled={loading}
              >
                Retour connexion
              </button>
            </form>
          )}
        </div>
      </section>

      {idResult?.found && (
        <div className="confirm-overlay login-id-overlay" onClick={backToLogin}>
          <div className="login-id-modal login-id-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="login-id-identity">
              <div className="login-id-photo-wrap">
                {photoUrl ? (
                  <img src={photoUrl} alt={`${idResult.prenom || ''} ${idResult.nom || ''}`.trim()} />
                ) : (
                  <div className="login-id-photo-fallback">
                    {(idResult.prenom || idResult.nom || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="login-id-fields">
                <div>
                  <span>Nom</span>
                  <strong>{idResult.prenom} {idResult.nom}</strong>
                </div>
                <div>
                  <span>Club</span>
                  <strong>{idResult.club || '-'}</strong>
                </div>
                <div>
                  <span>Ceinture</span>
                  <strong>{idResult.grade || '-'}</strong>
                </div>
                {idResult.numero_carte ? (
                  <div>
                    <span>ID</span>
                    <strong>{idResult.numero_carte}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            <section className="login-id-ranking" aria-label="Ranking athlète">
              <header className="login-id-ranking-head">
                <p className="login-id-ranking-kicker">Ranking</p>
                <h3>Classement de l&apos;athlète</h3>
                {ranking?.season_label ? (
                  <p className="form-hint">{ranking.season_label}</p>
                ) : null}
              </header>

              {!ranking ? (
                <p className="form-hint">Aucun Ranking disponible pour le moment.</p>
              ) : (
                <>
                  <div className="athlete-ranking-stats login-id-ranking-stats">
                    <div>
                      <span>Classement</span>
                      <strong>
                        {ranking.rank ? `#${ranking.rank}` : '-'}
                        {ranking.category_size ? ` / ${ranking.category_size}` : ''}
                      </strong>
                    </div>
                    <div>
                      <span>Points</span>
                      <strong>{ranking.points || 0}</strong>
                    </div>
                    <div>
                      <span>Catégorie</span>
                      <strong>
                        {ranking.categorie_age || 'Seniors'}
                        {' · '}
                        {(idResult.sexe || ranking.judoka?.sexe || '').toString().toUpperCase().startsWith('F') ? 'F' : 'M'}
                        {' · '}
                        {ranking.categorie_poids || idResult.categorie || '-'}
                      </strong>
                    </div>
                    <div>
                      <span>Médailles d&apos;or</span>
                      <strong>{ranking.gold_medals || 0}</strong>
                    </div>
                  </div>

                  <div className="login-id-ranking-block">
                    <h4>Meilleures performances</h4>
                    {(ranking.best_results || []).length === 0 ? (
                      <p className="form-hint">Aucun résultat Ranking pour cet athlète.</p>
                    ) : (
                      <ul className="athlete-ranking-results">
                        {ranking.best_results.map((r) => (
                          <li key={r.id || `${r.competition_name}-${r.place}-${r.points}`}>
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
                  </div>

                  <div className="login-id-ranking-block">
                    <h4>Top catégorie de poids</h4>
                    {(ranking.category_board || []).length === 0 ? (
                      <p className="form-hint">Pas encore de classement dans cette catégorie.</p>
                    ) : (
                      <div className="login-id-ranking-table-wrap">
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
                            {ranking.category_board.map((row) => (
                              <tr
                                key={`${row.rank}-${row.nom}-${row.prenom}`}
                                className={
                                  athleteId && row.judoka_id && String(row.judoka_id) === String(athleteId)
                                    ? 'is-self'
                                    : ''
                                }
                              >
                                <td>{row.rank}</td>
                                <td>{row.prenom} {row.nom}</td>
                                <td>{row.club || '-'}</td>
                                <td><strong>{row.points}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <button type="button" className="btn login-mon-id-btn" onClick={backToLogin}>
              Retour connexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
