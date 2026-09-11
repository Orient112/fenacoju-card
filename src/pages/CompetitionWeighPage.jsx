import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchPublicCompetitionRegistrations, updatePublicCompetitionWeight } from '../api';
import { parseCategoriesPoids } from '../utils/weightCategories';

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'garcon', label: 'Garçon' },
  { key: 'fille', label: 'Fille' },
  { key: 'deja_pese', label: 'Déjà pesé' },
  { key: 'non_pese', label: 'Non pesé' },
];

function isTeamRegistration(r) {
  return r?.mode_inscription === 'equipe' || String(r?.taille || '').startsWith('__mode_equipe__');
}

function teamCategoryLabel(r) {
  const raw = String(r?.categorie || '').trim();
  if (raw && !/principal|rempl/i.test(raw)) return raw;
  return String(r?.poids || '').trim() ? `${r.poids} kg` : '—';
}

export default function CompetitionWeighPage({ token }) {
  const weighMode = useMemo(() => new URLSearchParams(window.location.search).get('mode'), []);
  const isTeamMode = weighMode === 'equipe';

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

  const modeRegistrations = useMemo(() => (
    registrations.filter((r) => {
      const isTeam = isTeamRegistration(r);
      if (weighMode === 'equipe') return isTeam;
      if (weighMode === 'individuel') return !isTeam;
      return true;
    })
  ), [registrations, weighMode]);

  const clubs = useMemo(() => {
    const set = new Set();
    for (const r of modeRegistrations) {
      const club = (r.club || '').trim();
      if (club) set.add(club);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [modeRegistrations]);

  const poidsOptions = useMemo(() => {
    if (isTeamMode) {
      const fromSettings = parseCategoriesPoids(competition?.categories_poids).map((c) => c.label);
      const fromRegs = modeRegistrations.map((r) => teamCategoryLabel(r)).filter((l) => l && l !== '—');
      return [...new Set([...fromSettings, ...fromRegs])].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    }
    const set = new Set();
    for (const r of modeRegistrations) {
      const p = String(r.poids || '').trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'fr'));
  }, [isTeamMode, competition, modeRegistrations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return modeRegistrations.filter((r) => {
      if (filterClub && (r.club || '').trim() !== filterClub) return false;
      if (filterPoids) {
        if (isTeamMode) {
          if (teamCategoryLabel(r) !== filterPoids) return false;
        } else if (String(r.poids || '').trim() !== filterPoids) {
          return false;
        }
      }

      if (activeFilter === 'garcon' && r.sexe === 'F') return false;
      if (activeFilter === 'fille' && r.sexe !== 'F') return false;
      if (activeFilter === 'deja_pese' && !r.poids) return false;
      if (activeFilter === 'non_pese' && r.poids) return false;

      if (!term) return true;
      if (isTeamMode) {
        return (r.club || '').toLowerCase().includes(term) || teamCategoryLabel(r).toLowerCase().includes(term);
      }
      const full = `${r.prenom || ''} ${r.nom || ''}`.trim().toLowerCase();
      const reverse = `${r.nom || ''} ${r.prenom || ''}`.trim().toLowerCase();
      return full.includes(term) || reverse.includes(term) || (r.nom || '').toLowerCase().includes(term);
    });
  }, [modeRegistrations, search, filterClub, filterPoids, activeFilter, isTeamMode]);

  const clubGroups = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const club = (r.club || '').trim() || 'Club';
      if (!map.has(club)) map.set(club, []);
      map.get(club).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [filtered]);

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
        const relevant = next.filter((r) => {
          const isTeam = isTeamRegistration(r);
          if (weighMode === 'equipe') return isTeam;
          if (weighMode === 'individuel') return !isTeam;
          return true;
        });
        const allDone = relevant.length > 0 && relevant.every((r) => r.poids);
        if (allDone) {
          setMessage('Pesé Clôturée');
        } else {
          setMessage(isTeamMode
            ? `Poids validé · ${(updated.club || '').trim() || 'Club'} · ${teamCategoryLabel({ ...updated })}`
            : `Poids validé pour ${updated.prenom} ${updated.nom}`);
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

  const weighed = filtered.filter((r) => r.poids).length;
  const weighComplete = filtered.length > 0 && weighed === filtered.length;

  return (
    <div className="competition-public-page">
      <div className="competition-public-shell competition-weigh-shell">
        <header className="competition-public-brand">
          <img src="/fenacoju-logo.png" alt="FENACOJU" width="56" height="56" />
          <div className="competition-public-brand-text">
            <p className="competition-public-kicker">
              Pesée · {isTeamMode ? 'Par équipe' : (weighMode === 'individuel' ? 'Individuel' : 'FENACOJU')}
            </p>
            <h1>{competition.nom}</h1>
            <p>
              {competition.lieu}
              {isTeamMode
                ? ` · ${clubGroups.length} club${clubGroups.length > 1 ? 's' : ''}`
                : ` · ${filtered.length} inscrit${filtered.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="competition-count-badge">
            <strong>{weighed}/{filtered.length}</strong>
            <span>pesés</span>
          </div>
        </header>

        {weighComplete && (
          <div className="competition-weigh-closed">
            <strong>Pesé Clôturée</strong>
            <p>
              {isTeamMode
                ? 'Tous les clubs ont été pesés sur les catégories par équipe. Le tirage au sort est disponible sur la page Compétition.'
                : 'Tous les judokas inscrits ont été pesés. Le tirage au sort est disponible sur la page Compétition.'}
            </p>
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
              <span>{isTeamMode ? 'Catégorie / Poids' : 'Poids'}</span>
              <select value={filterPoids} onChange={(e) => setFilterPoids(e.target.value)}>
                <option value="">{isTeamMode ? 'Toutes les catégories' : 'Tous les poids'}</option>
                {poidsOptions.map((p) => (
                  <option key={p} value={p}>{isTeamMode ? p : `${p} kg`}</option>
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
            placeholder={isTeamMode ? 'Rechercher un club ou une catégorie...' : 'Rechercher par nom...'}
            aria-label={isTeamMode ? 'Rechercher un club' : 'Rechercher un judoka par nom'}
          />
        </div>

        {message && !weighComplete && <div className="form-hint competition-weigh-msg">{message}</div>}

        {modeRegistrations.length === 0 ? (
          <div className="empty-state">
            <h3>{isTeamMode ? 'Aucun club inscrit' : 'Aucun inscrit'}</h3>
            <p>
              {isTeamMode
                ? 'Les clubs inscrits en Par équipe apparaîtront ici avec leurs catégories de poids.'
                : 'Les judokas apparaîtront ici dès qu\'ils s\'inscrivent.'}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>Aucun résultat</h3>
            <p>{isTeamMode ? 'Aucun club ne correspond aux filtres / recherche.' : 'Aucun judoka ne correspond aux filtres / recherche.'}</p>
          </div>
        ) : isTeamMode ? (
          <div className="competition-weigh-list">
            {clubGroups.map(([club, members]) => (
              <section key={club} className="competition-weigh-club">
                <header className="competition-weigh-club-head">
                  <h3>{club}</h3>
                  <span>{members.length} catégorie{members.length > 1 ? 's' : ''}</span>
                </header>
                {members.map((r) => {
                  const done = Boolean(r.poids);
                  return (
                    <div key={r.id} className={`competition-weigh-row ${done ? 'is-done' : ''}`}>
                      <div className="competition-weigh-identity">
                        <div>
                          <strong className="competition-weigh-name">{teamCategoryLabel(r)}</strong>
                          <span className="competition-weigh-cat-meta">
                            {r.sexe === 'F' ? 'Fille' : 'Garçon'}
                            {r.role_equipe === 'remplacant' || String(r.taille || '').includes('remplacant') ? ' · Remplaçant' : ' · Principal'}
                          </span>
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
                          aria-label={`Poids ${club} ${teamCategoryLabel(r)}`}
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
              </section>
            ))}
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
                    <strong className="competition-weigh-name">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</strong>
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
