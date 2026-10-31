import { useEffect, useState } from 'react';
import { fetchSuperAdminStats, resolveMediaUrl } from '../api';

export default function SuperAdminDashboard({ onManageFederations }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    federations: 0,
    judokas: 0,
    clubs: 0,
    by_federation: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchSuperAdminStats();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
        <p>Chargement du tableau de bord…</p>
      </div>
    );
  }

  return (
    <div className="sa-dashboard">
      <header className="sa-dashboard-hero">
        <div className="sa-dashboard-hero-copy">
          <p className="sa-kicker">Console SuperAdmin</p>
          <h2>Vue d&apos;ensemble</h2>
          <p>Pilotage consolidé de toutes les fédérations du système.</p>
        </div>
        {onManageFederations && (
          <button type="button" className="btn btn-primary" onClick={onManageFederations}>
            Gérer les fédérations
          </button>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      <div className="sa-metric-row">
        <article className="sa-metric sa-metric-federations">
          <span className="sa-metric-label">Fédérations</span>
          <strong className="sa-metric-value">{stats.federations}</strong>
        </article>
        <article className="sa-metric sa-metric-athletes">
          <span className="sa-metric-label">Athlètes</span>
          <strong className="sa-metric-value">{stats.judokas}</strong>
        </article>
        <article className="sa-metric sa-metric-clubs">
          <span className="sa-metric-label">Clubs</span>
          <strong className="sa-metric-value">{stats.clubs}</strong>
        </article>
      </div>

      <section className="sa-fed-section">
        <div className="sa-fed-section-head">
          <h3>Fédérations</h3>
          <span>{(stats.by_federation || []).length} espace(s)</span>
        </div>

        {(stats.by_federation || []).length === 0 ? (
          <div className="empty-state">
            <h3>Aucune fédération</h3>
            <p>Créez une fédération depuis le menu Fédérations.</p>
          </div>
        ) : (
          <div className="sa-fed-list">
            {(stats.by_federation || []).map((f) => (
              <article key={f.id} className="sa-fed-row">
                <div className="sa-fed-row-main">
                  <img
                    src={f.logo_url ? resolveMediaUrl(f.logo_url) : '/fenacoju-logo.png'}
                    alt=""
                    className="sa-fed-avatar"
                  />
                  <div>
                    <strong>{f.nom}</strong>
                    {f.slug ? <div className="judoka-club">{f.slug}</div> : null}
                  </div>
                </div>
                <div className="sa-fed-row-stats">
                  <span><b>{f.judokas}</b> athlètes</span>
                  <span><b>{f.clubs}</b> clubs</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
