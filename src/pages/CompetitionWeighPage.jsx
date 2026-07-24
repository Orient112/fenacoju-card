import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchPublicCompetitionRegistrations, updatePublicCompetitionWeight } from '../api';

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'garcon', label: 'Garçon' },
  { key: 'fille', label: 'Fille' },
  { key: 'deja_pese', label: 'Déjà pesé' },
  { key: 'non_pese', label: 'Non pesé' },
];

export default function CompetitionWeighPage({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [competition, setCompetition] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [weights, setWeights] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterClub, setFilterClub] = useState('');
  const [filterPoids, setFilterPoids] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

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
          if (r.poids) {
            next[r.id] = r.poids;
          } else if (next[r.id] === undefined) {
            next[r.id] = '';
          }
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

  const clubs = useMemo(() => {
    const set = new Set();
    for (const r of registrations) {
      const club = (r.club || '').trim();
      if (club) set.add(club);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [registrations]);

  const poidsOptions = useMemo(() => {
    const set = new Set();
    for (const r of registrations) {
      const p = String(r.poids || '').trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'fr'));
  }, [registrations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return registrations.filter((r) => {
      if (filterClub && (r.club || '').trim() !== filterClub) return false;
      if (filterPoids && String(r.poids || '').trim() !== filterPoids) return false;

      if (activeFilter === 'garcon' && r.sexe === 'F') return false;
      if (activeFilter === 'fille' && r.sexe !== 'F') return false;
      if (activeFilter === 'deja_pese' && !r.poids) return false;
      if (activeFilter === 'non_pese' && r.poids) return false;

      if (!term) return true;
      const full = `${r.prenom || ''} ${r.nom || ''}`.trim().toLowerCase();
      const reverse = `${r.nom || ''} ${r.prenom || ''}`.trim().toLowerCase();
      return full.includes(term) || reverse.includes(term) || (r.nom || '').toLowerCase().includes(term);
    });
  }, [registrations, search, filterClub, filterPoids, activeFilter]);

  const handleWeightChange = (id, value) => {
    setWeights((prev) => ({ ...prev, [id]: value }));
  };

  const handleValidate = async (registration) => {
    if (registration.poids) return;
    const poids = String(weights[registration.id] ?? '').trim();
    if (!poids) {
      setMessage('Saisissez un poids avant de valider.');
      return;
    }
    setSavingId(registration.id);
    setMessage('');
    try {
      const updated = await updatePublicCompetitionWeight(token, registration.id, poids);
      setRegistrations((prev) => {
        const next = prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
        const allDone = next.length > 0 && next.every((r) => r.poids);
        if (allDone) {
          setMessage('Pesé Clôturée');
        } else {
          setMessage(`Poids validé pour ${updated.prenom} ${updated.nom}`);
        }
        return next;
      });
      setWeights((prev) => ({ ...prev, [updated.id]: updated.poids || '' }));
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
  const weighComplete = registrations.length > 0 && weighed === registrations.length;

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

        {weighComplete && (
          <div className="competition-weigh-closed">
            <strong>Pesé Clôturée</strong>
            <p>Tous les judokas inscrits ont été pesés. Le tirage au sort est disponible sur la page Compétition.</p>
          </div>
        )}

        <div className="competition-weigh-filters">
          <div className="competition-weigh-filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`competition-filter-chip ${activeFilter === f.key ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="competition-weigh-filter-selects">
            <label>
              <span>Club</span>
              <select value={filterClub} onChange={(e) => setFilterClub(e.target.value)}>
                <option value="">Tous les clubs</option>
                {clubs.map((club) => (
                  <option key={club} value={club}>{club}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Poids</span>
              <select value={filterPoids} onChange={(e) => setFilterPoids(e.target.value)}>
                <option value="">Tous les poids</option>
                {poidsOptions.map((p) => (
                  <option key={p} value={p}>{p} kg</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="competition-weigh-toolbar">
          <input
            className="search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom..."
            aria-label="Rechercher un judoka par nom"
          />
        </div>

        {message && !weighComplete && <div className="form-hint competition-weigh-msg">{message}</div>}

        {registrations.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun inscrit</h3>
            <p>Les judokas apparaîtront ici dès qu&apos;ils s&apos;inscrivent.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun résultat</h3>
            <p>Aucun judoka ne correspond aux filtres / recherche.</p>
          </div>
        ) : (
          <div className="competition-weigh-list">
            {filtered.map((r) => {
              const done = Boolean(r.poids);
              const originalIndex = registrations.findIndex((item) => item.id === r.id);
              return (
                <div key={r.id} className={`competition-weigh-row ${done ? 'is-done' : ''}`}>
                  <div className="competition-weigh-identity">
                    <span className="competition-weigh-num">{originalIndex + 1}</span>
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
                      readOnly={done}
                      disabled={done}
                    />
                    <button
                      type="button"
                      className={`btn ${done ? 'btn-pese-done' : 'btn-primary'}`}
                      disabled={done || savingId === r.id}
                      onClick={() => handleValidate(r)}
                    >
                      {done ? 'Pesé' : (savingId === r.id ? '...' : 'Valider')}
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
