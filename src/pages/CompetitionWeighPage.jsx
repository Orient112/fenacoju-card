import { useState, useEffect, useCallback } from 'react';
import { fetchPublicCompetitionRegistrations, updatePublicCompetitionWeight } from '../api';

export default function CompetitionWeighPage({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [competition, setCompetition] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [weights, setWeights] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await fetchPublicCompetitionRegistrations(token);
      setCompetition(data.competition);
      setRegistrations(data.registrations || []);
      setWeights((prev) => {
        const next = { ...prev };
        for (const r of data.registrations || []) {
          if (next[r.id] === undefined) next[r.id] = r.poids || '';
        }
        return next;
      });
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || error) return undefined;
    const id = setInterval(() => load(true), 2000);
    return () => clearInterval(id);
  }, [loading, error, load]);

  const handleWeightChange = (id, value) => {
    setWeights((prev) => ({ ...prev, [id]: value }));
  };

  const handleValidate = async (registration) => {
    const poids = String(weights[registration.id] ?? '').trim();
    if (!poids) {
      setMessage('Saisissez un poids avant de valider.');
      return;
    }
    setSavingId(registration.id);
    setMessage('');
    try {
      const updated = await updatePublicCompetitionWeight(token, registration.id, poids);
      setRegistrations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setWeights((prev) => ({ ...prev, [updated.id]: updated.poids || '' }));
      setMessage(`Poids validé pour ${updated.prenom} ${updated.nom}`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="competition-public-page">
        <div className="page-loader">
          <div className="spinner" />
          <p>Chargement de la pesée...</p>
        </div>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="competition-public-page">
        <div className="competition-public-shell">
          <div className="empty-state">
            <h3>Page de pesée indisponible</h3>
            <p>{error || 'La compétition n\'est pas ouverte.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const weighed = registrations.filter((r) => r.poids).length;

  return (
    <div className="competition-public-page">
      <div className="competition-public-shell competition-weigh-shell">
        <header className="competition-public-brand">
          <img src="/fenacoju-logo.png" alt="FENACOJU" width="56" height="56" />
          <div className="competition-public-brand-text">
            <p className="competition-public-kicker">Pesée · FENACOJU</p>
            <h1>{competition.nom}</h1>
            <p>{competition.lieu} · {registrations.length} inscrit{registrations.length > 1 ? 's' : ''}</p>
          </div>
          <div className="competition-count-badge">
            <strong>{weighed}/{registrations.length}</strong>
            <span>pesés</span>
          </div>
        </header>

        {message && <div className="form-hint competition-weigh-msg">{message}</div>}

        {registrations.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun inscrit</h3>
            <p>Les judokas apparaîtront ici dès qu&apos;ils s&apos;inscrivent.</p>
          </div>
        ) : (
          <div className="competition-weigh-list">
            {registrations.map((r, idx) => {
              const done = Boolean(r.poids);
              return (
                <div key={r.id} className={`competition-weigh-row ${done ? 'is-done' : ''}`}>
                  <div className="competition-weigh-identity">
                    <span className="competition-weigh-num">{idx + 1}</span>
                    <div>
                      <strong>{`${r.prenom || ''} ${r.nom || ''}`.trim()}</strong>
                      <p>
                        {r.club || '—'}
                        {r.categorie ? ` · ${r.categorie}` : ''}
                        {r.numero_carte ? ` · ${r.numero_carte}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="competition-weigh-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      placeholder="Poids kg"
                      value={weights[r.id] ?? ''}
                      onChange={(e) => handleWeightChange(r.id, e.target.value)}
                      aria-label={`Poids de ${r.prenom} ${r.nom}`}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={savingId === r.id}
                      onClick={() => handleValidate(r)}
                    >
                      {savingId === r.id ? '...' : 'Valider'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
