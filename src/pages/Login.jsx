import { useState } from 'react';
import { loginUser, verifyJudokaId } from '../api';

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

              {idResult && (
                <div className={`login-id-result ${idResult.found ? 'is-found' : 'is-missing'}`}>
                  {idResult.found ? (
                    <>
                      <strong>ID reconnu</strong>
                      <p>
                        {idResult.prenom} {idResult.nom}
                        {idResult.club ? ` · ${idResult.club}` : ''}
                      </p>
                      <p className="form-hint">
                        {idResult.numero_carte}
                        {idResult.grade ? ` · ${idResult.grade}` : ''}
                        {idResult.statut ? ` · ${idResult.statut}` : ''}
                      </p>
                    </>
                  ) : (
                    <p>Cet ID n&apos;est pas enregistré dans le système.</p>
                  )}
                </div>
              )}

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
    </div>
  );
}
