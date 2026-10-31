import { useEffect, useState } from 'react';
import { fetchSuperAdminStats, resolveMediaUrl } from '../api';
import StatCard from './StatCard';
import {
  IconPeople,
  IconPerson,
  IconBuilding,
  IconFlag,
  IconWhistle,
  IconCheck,
} from './ActionIcons';

export default function SuperAdminDashboard({ onManageFederations }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    federations: 0,
    admins: 0,
    judokas: 0,
    judokas_actifs: 0,
    clubs: 0,
    ligues: 0,
    ententes: 0,
    entraineurs: 0,
    arbitres: 0,
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
    <div className="superadmin-panel">
      <div className="list-toolbar">
        <div>
          <h2>Tableau de bord</h2>
          <p className="form-hint">Vue consolidée de toutes les fédérations.</p>
        </div>
        {onManageFederations && (
          <button type="button" className="btn btn-outline" onClick={onManageFederations}>
            Gérer les fédérations
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="stats-grid">
        <StatCard theme="blue" icon={<IconFlag />} value={stats.federations} label="Fédérations" />
        <StatCard theme="blue" icon={<IconPerson />} value={stats.admins} label="Admins" />
        <StatCard theme="blue" icon={<IconPeople />} value={stats.judokas} label="Judokas" />
        <StatCard theme="blue" icon={<IconCheck />} value={stats.judokas_actifs} label="Judokas actifs" />
        <StatCard theme="blue" icon={<IconBuilding />} value={stats.clubs} label="Clubs" />
        <StatCard theme="blue" icon={<IconFlag />} value={stats.ligues} label="Ligues" />
        <StatCard theme="blue" icon={<IconBuilding />} value={stats.ententes} label="Ententes" />
        <StatCard theme="blue" icon={<IconPerson />} value={stats.entraineurs} label="Entraineurs" />
        <StatCard theme="blue" icon={<IconWhistle />} value={stats.arbitres} label="Arbitres" />
      </div>

      <section className="superadmin-fed-stats">
        <h3>Par fédération</h3>
        {(stats.by_federation || []).length === 0 ? (
          <div className="empty-state">
            <h3>Aucune fédération</h3>
            <p>Créez une fédération depuis le menu Fédérations.</p>
          </div>
        ) : (
          <div className="superadmin-fed-grid">
            {(stats.by_federation || []).map((f) => (
              <article key={f.id} className="superadmin-fed-card">
                <div className="superadmin-fed-card-head">
                  <img
                    src={f.logo_url ? resolveMediaUrl(f.logo_url) : '/fenacoju-logo.png'}
                    alt=""
                    className="superadmin-fed-logo"
                  />
                  <div>
                    <strong>{f.nom}</strong>
                    {f.slug ? <div className="judoka-club">{f.slug}</div> : null}
                  </div>
                </div>
                <div className="superadmin-fed-metrics">
                  <span><b>{f.judokas}</b> judokas</span>
                  <span><b>{f.clubs}</b> clubs</span>
                  <span><b>{f.ligues}</b> ligues</span>
                  <span><b>{f.ententes}</b> ententes</span>
                  <span><b>{f.entraineurs}</b> coachs</span>
                  <span><b>{f.arbitres}</b> arbitres</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
