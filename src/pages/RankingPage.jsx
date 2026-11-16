import { useEffect, useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import { IconEdit, IconTrash } from '../components/ActionIcons';
import {
  createRankingResult,
  deleteRankingAthleteProfile,
  fetchRankingBoard,
  fetchRankingRules,
  updateRankingAthleteProfile,
  updateRankingRules,
} from '../api';

const AGE_OPTIONS = ['Minimes', 'Cadets', 'Juniors', 'Seniors'];

const WEIGHT_BY_SEX = {
  F: ['-48 kg', '-52 kg', '-57 kg', '-63 kg', '-70 kg', '-78 kg', '+78 kg'],
  M: ['-60 kg', '-66 kg', '-73 kg', '-81 kg', '-90 kg', '-100 kg', '+100 kg'],
};

const emptyResultForm = {
  judoka_prenom: '',
  judoka_nom: '',
  judoka_club: '',
  judoka_sexe: 'M',
  categorie_age: 'Seniors',
  categorie_poids: '-73 kg',
  competition_name: '',
  competition_level: 'A',
  place: 1,
  wins: 1,
  competition_date: '',
  note: '',
};

function weightOptionsFor(sexe) {
  if (sexe === 'F') return WEIGHT_BY_SEX.F;
  if (sexe === 'M') return WEIGHT_BY_SEX.M;
  return [];
}

function ensureWeightForSex(sexe, current) {
  const opts = weightOptionsFor(sexe);
  if (!opts.length) return '';
  if (opts.includes(current)) return current;
  return opts[0];
}

export default function RankingPage({ user, onToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [board, setBoard] = useState([]);
  const [rules, setRules] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [season, setSeason] = useState('');
  const [sexe, setSexe] = useState('M');
  const [categorieAge, setCategorieAge] = useState('Seniors');
  const [categoriePoids, setCategoriePoids] = useState('-73 kg');
  const [tab, setTab] = useState('board');
  const [resultForm, setResultForm] = useState(emptyResultForm);
  const [editAthlete, setEditAthlete] = useState(null);
  const [levelDraft, setLevelDraft] = useState(null);
  const [coeffDraft, setCoeffDraft] = useState(null);

  const weightOptions = useMemo(() => weightOptionsFor(sexe), [sexe]);
  const resultWeightOptions = useMemo(
    () => weightOptionsFor(resultForm.judoka_sexe),
    [resultForm.judoka_sexe]
  );
  const editWeightOptions = useMemo(
    () => weightOptionsFor(editAthlete?.judoka_sexe || 'M'),
    [editAthlete?.judoka_sexe]
  );

  const scopeHint = user?.type === 'ligue'
    ? 'Périmètre : votre ligue'
    : user?.type === 'entente'
      ? 'Périmètre : votre entente'
      : user?.type === 'club'
        ? 'Périmètre : votre club'
        : 'Classement national de la fédération';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRankingBoard({
        sexe: sexe || undefined,
        categorie_age: categorieAge || undefined,
        categorie_poids: categoriePoids || undefined,
        season: season || undefined,
      });
      setBoard(data.board || []);
      setRules(data.rules || null);
      setCanManage(Boolean(data.can_manage_rules));
      if (!season && data.season_label) setSeason(data.season_label);
    } catch (err) {
      setError(err.message || 'Chargement Ranking impossible');
      onToast?.(err.message || 'Chargement Ranking impossible', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sexe, categorieAge, categoriePoids]);

  const levels = useMemo(() => rules?.levels || [], [rules]);
  const coeffs = useMemo(() => rules?.result_coefficients || [], [rules]);

  const handleSexeChange = (next) => {
    setSexe(next);
    setCategoriePoids(ensureWeightForSex(next, categoriePoids));
  };

  const handleExport = async () => {
    if (!board.length) {
      onToast?.('Aucun classement à exporter', 'error');
      return;
    }
    setExporting(true);
    try {
      const { exportRankingBoardToPdf } = await import('../utils/exportRankingPdf.js');
      exportRankingBoardToPdf(board, {
        season_label: season,
        sexe,
        categorie_age: categorieAge,
        categorie_poids: categoriePoids,
      });
      onToast?.('Classement exporté en PDF', 'success');
    } catch (err) {
      onToast?.(err.message || 'Export PDF impossible', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveRules = async (e) => {
    e.preventDefault();
    if (!canManage || !rules) return;
    setBusy(true);
    try {
      const saved = await updateRankingRules(rules);
      setRules(saved);
      onToast?.('Règles Ranking enregistrées', 'success');
      await load();
    } catch (err) {
      onToast?.(err.message || 'Enregistrement impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddResult = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    try {
      await createRankingResult(resultForm);
      onToast?.('Résultat Ranking enregistré', 'success');
      setResultForm({
        ...emptyResultForm,
        judoka_sexe: resultForm.judoka_sexe,
        categorie_age: resultForm.categorie_age,
        categorie_poids: resultForm.categorie_poids,
        competition_level: resultForm.competition_level,
      });
      setTab('board');
      await load();
    } catch (err) {
      onToast?.(err.message || 'Enregistrement impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openEditAthlete = (row) => {
    setEditAthlete({
      judoka_id: row.judoka_id || '',
      judoka_nom: row.nom || '',
      judoka_prenom: row.prenom || '',
      judoka_club: row.club || '',
      judoka_sexe: row.sexe === 'F' ? 'F' : 'M',
      categorie_age: row.categorie_age || 'Seniors',
      categorie_poids: row.categorie_poids || ensureWeightForSex(row.sexe === 'F' ? 'F' : 'M', ''),
      original: {
        judoka_id: row.judoka_id || '',
        nom: row.nom || '',
        prenom: row.prenom || '',
        club: row.club || '',
      },
    });
  };

  const handleSaveAthlete = async (e) => {
    e.preventDefault();
    if (!editAthlete || !canManage) return;
    setBusy(true);
    try {
      await updateRankingAthleteProfile({
        ...editAthlete.original,
        judoka_id: editAthlete.original.judoka_id || editAthlete.judoka_id,
        judoka_nom: editAthlete.judoka_nom,
        judoka_prenom: editAthlete.judoka_prenom,
        judoka_club: editAthlete.judoka_club,
        judoka_sexe: editAthlete.judoka_sexe,
        categorie_age: editAthlete.categorie_age,
        categorie_poids: editAthlete.categorie_poids,
        season_label: season,
      });
      onToast?.('Athlète Ranking modifié', 'success');
      setEditAthlete(null);
      await load();
    } catch (err) {
      onToast?.(err.message || 'Modification impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAthlete = async (row) => {
    if (!canManage) return;
    const label = `${row.prenom || ''} ${row.nom || ''}`.trim();
    if (!window.confirm(`Supprimer ${label || 'cet athlète'} du Ranking de la saison ?`)) return;
    setBusy(true);
    try {
      await deleteRankingAthleteProfile({
        judoka_id: row.judoka_id,
        nom: row.nom,
        prenom: row.prenom,
        club: row.club,
        season_label: season,
      });
      onToast?.('Athlète retiré du Ranking', 'success');
      await load();
    } catch (err) {
      onToast?.(err.message || 'Suppression impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addLevel = () => {
    setLevelDraft({
      mode: 'add',
      key: '',
      label: '',
      points: 100,
    });
  };

  const editLevel = (idx) => {
    const level = levels[idx];
    setLevelDraft({
      mode: 'edit',
      index: idx,
      key: level.key || '',
      label: level.label || '',
      points: level.points || 0,
    });
  };

  const saveLevelDraft = () => {
    if (!levelDraft) return;
    const key = String(levelDraft.key || '').trim().toUpperCase().slice(0, 4);
    const label = String(levelDraft.label || '').trim();
    if (!key || !label) {
      onToast?.('Clé et libellé obligatoires', 'error');
      return;
    }
    setRules((prev) => {
      const next = [...(prev.levels || [])];
      const item = { key, label, points: Math.max(0, Number(levelDraft.points) || 0) };
      if (levelDraft.mode === 'edit') next[levelDraft.index] = item;
      else next.push(item);
      return { ...prev, levels: next };
    });
    setLevelDraft(null);
  };

  const removeLevel = (idx) => {
    if (!window.confirm('Supprimer ce niveau de compétition ?')) return;
    setRules((prev) => ({
      ...prev,
      levels: (prev.levels || []).filter((_, i) => i !== idx),
    }));
  };

  const addCoeff = () => {
    setCoeffDraft({
      mode: 'add',
      place: 1,
      label: '',
      percent: 100,
    });
  };

  const editCoeff = (idx) => {
    const c = coeffs[idx];
    setCoeffDraft({
      mode: 'edit',
      index: idx,
      place: c.place ?? 0,
      label: c.label || '',
      percent: c.percent ?? 0,
    });
  };

  const saveCoeffDraft = () => {
    if (!coeffDraft) return;
    const label = String(coeffDraft.label || '').trim();
    if (!label) {
      onToast?.('Libellé obligatoire', 'error');
      return;
    }
    setRules((prev) => {
      const next = [...(prev.result_coefficients || [])];
      const item = {
        place: Number(coeffDraft.place) || 0,
        label,
        percent: Math.max(0, Math.min(100, Number(coeffDraft.percent) || 0)),
      };
      if (coeffDraft.mode === 'edit') next[coeffDraft.index] = item;
      else next.push(item);
      return { ...prev, result_coefficients: next };
    });
    setCoeffDraft(null);
  };

  const removeCoeff = (idx) => {
    if (!window.confirm('Supprimer ce coefficient ?')) return;
    setRules((prev) => ({
      ...prev,
      result_coefficients: (prev.result_coefficients || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="ranking-page ranking-page-pro">
      <header className="ranking-hero">
        <div className="ranking-hero-copy">
          <p className="ranking-kicker">Performance sportive</p>
          <h2>Ranking</h2>
          <p>
            Classement officiel des athlètes par points
            {season ? ` - ${season}` : ''}.
            {' '}
            {scopeHint}.
          </p>
        </div>
        <nav className="ranking-segment" aria-label="Onglets Ranking">
          <button
            type="button"
            className={tab === 'board' ? 'is-active' : ''}
            onClick={() => setTab('board')}
          >
            Classement
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={tab === 'rules' ? 'is-active' : ''}
                onClick={async () => {
                  setTab('rules');
                  try {
                    const r = await fetchRankingRules();
                    setRules(r);
                    setCanManage(Boolean(r.can_manage_rules));
                  } catch (err) {
                    onToast?.(err.message, 'error');
                  }
                }}
              >
                Règles des points
              </button>
              <button
                type="button"
                className={tab === 'result' ? 'is-active' : ''}
                onClick={() => setTab('result')}
              >
                Ajouter un résultat
              </button>
            </>
          )}
        </nav>
      </header>

      {error ? <div className="form-error">{error}</div> : null}

      {tab === 'board' && (
        <section className="ranking-panel">
          <div className="ranking-toolbar">
            <div className="ranking-filters-pro">
              <label>
                <span>Sexe</span>
                <select value={sexe} onChange={(e) => handleSexeChange(e.target.value)}>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </label>
              <label>
                <span>Catégorie d&apos;âge</span>
                <select value={categorieAge} onChange={(e) => setCategorieAge(e.target.value)}>
                  {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>
                <span>Catégorie de poids ({sexe === 'F' ? 'Filles' : 'Garçons'})</span>
                <select value={categoriePoids} onChange={(e) => setCategoriePoids(e.target.value)}>
                  <option value="">Toutes</option>
                  {weightOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
            </div>
            <div className="ranking-toolbar-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
                Actualiser
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleExport}
                disabled={loading || exporting || !board.length}
              >
                {exporting ? 'Export…' : 'Exporter'}
              </button>
            </div>
          </div>

          {loading ? (
            <BrandLoader label="Chargement du Ranking…" />
          ) : board.length === 0 ? (
            <div className="ranking-empty">
              <h3>Aucun athlète classé</h3>
              <p>Aucun résultat pour {sexe === 'F' ? 'les filles' : 'les garçons'}
                {categoriePoids ? ` · ${categoriePoids}` : ''}
                {categorieAge ? ` · ${categorieAge}` : ''}.
              </p>
            </div>
          ) : (
            <div className="ranking-table-wrap">
              <table className="ranking-table-pro">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Athlète</th>
                    <th>Club</th>
                    <th>Catégorie</th>
                    <th>Or</th>
                    <th>Victoires</th>
                    <th>Points</th>
                    {canManage ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {board.map((row) => (
                    <tr key={`${row.rank}-${row.nom}-${row.prenom}-${row.club}`}>
                      <td>
                        <span className={`ranking-rank-badge ${row.rank <= 3 ? 'is-podium' : ''}`}>
                          {row.rank}
                        </span>
                      </td>
                      <td>
                        <div className="ranking-athlete-cell">
                          <strong>{row.prenom} {row.nom}</strong>
                          <small>{row.sexe === 'F' ? 'Féminin' : 'Masculin'}</small>
                        </div>
                      </td>
                      <td>{row.club || '-'}</td>
                      <td>
                        <span className="ranking-chip">{row.categorie_age || '-'}</span>
                        <span className="ranking-chip">{row.categorie_poids || '-'}</span>
                      </td>
                      <td>{row.gold_medals || 0}</td>
                      <td>{row.wins || 0}</td>
                      <td><strong className="ranking-points">{row.points}</strong></td>
                      {canManage ? (
                        <td>
                          <div className="actions-cell">
                            <button
                              type="button"
                              className="btn btn-icon btn-icon-edit"
                              title="Modifier"
                              onClick={() => openEditAthlete(row)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="btn btn-icon btn-icon-delete"
                              title="Supprimer"
                              onClick={() => handleDeleteAthlete(row)}
                              disabled={busy}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'rules' && canManage && rules && (
        <section className="ranking-panel">
          <form className="ranking-rules-pro" onSubmit={handleSaveRules}>
            <div className="ranking-rules-top">
              <div className="form-group">
                <label>Saison</label>
                <input
                  value={rules.season_label || ''}
                  onChange={(e) => setRules((p) => ({ ...p, season_label: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Meilleures performances comptées</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={rules.best_results_count || 4}
                  onChange={(e) => setRules((p) => ({ ...p, best_results_count: Number(e.target.value) || 4 }))}
                />
                <p className="form-hint">Par défaut : 4 (règles FCJ).</p>
              </div>
            </div>

            <div className="ranking-section-head">
              <div>
                <h4>Niveaux de compétition</h4>
                <p className="form-hint">Barème de base selon l&apos;importance de la compétition.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={addLevel}>Ajouter</button>
            </div>
            <div className="ranking-rules-grid">
              {levels.map((level, idx) => (
                <div key={`${level.key}-${idx}`} className="ranking-rule-card-pro">
                  <div className="ranking-rule-card-top">
                    <strong>Niveau {level.key}</strong>
                    <div className="actions-cell">
                      <button type="button" className="btn btn-icon btn-icon-edit" title="Modifier" onClick={() => editLevel(idx)}>
                        <IconEdit />
                      </button>
                      <button type="button" className="btn btn-icon btn-icon-delete" title="Supprimer" onClick={() => removeLevel(idx)}>
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                  <p>{level.label}</p>
                  <span className="ranking-rule-points">{level.points} pts</span>
                </div>
              ))}
            </div>

            <div className="ranking-section-head">
              <div>
                <h4>Coefficients selon le résultat</h4>
                <p className="form-hint">Pourcentage appliqué au barème du niveau.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={addCoeff}>Ajouter</button>
            </div>
            <div className="ranking-rules-grid">
              {coeffs.map((c, idx) => (
                <div key={`${c.place}-${idx}`} className="ranking-rule-card-pro">
                  <div className="ranking-rule-card-top">
                    <strong>{c.label}</strong>
                    <div className="actions-cell">
                      <button type="button" className="btn btn-icon btn-icon-edit" title="Modifier" onClick={() => editCoeff(idx)}>
                        <IconEdit />
                      </button>
                      <button type="button" className="btn btn-icon btn-icon-delete" title="Supprimer" onClick={() => removeCoeff(idx)}>
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                  <p>Place {c.place}</p>
                  <span className="ranking-rule-points">{c.percent} %</span>
                </div>
              ))}
            </div>

            <p className="form-hint ranking-rules-note">
              Sans victoire effective, seuls les points de participation s&apos;appliquent.
            </p>

            <div className="ranking-rules-footer">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer les règles'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'result' && canManage && (
        <section className="ranking-panel">
          <form className="ranking-result-pro" onSubmit={handleAddResult}>
            <div className="ranking-form-grid">
              <label>
                Prénom
                <input
                  required
                  value={resultForm.judoka_prenom}
                  onChange={(e) => setResultForm((p) => ({ ...p, judoka_prenom: e.target.value }))}
                />
              </label>
              <label>
                Nom
                <input
                  required
                  value={resultForm.judoka_nom}
                  onChange={(e) => setResultForm((p) => ({ ...p, judoka_nom: e.target.value }))}
                />
              </label>
              <label>
                Club
                <input
                  value={resultForm.judoka_club}
                  onChange={(e) => setResultForm((p) => ({ ...p, judoka_club: e.target.value }))}
                />
              </label>
              <label>
                Sexe
                <select
                  value={resultForm.judoka_sexe}
                  onChange={(e) => {
                    const next = e.target.value;
                    setResultForm((p) => ({
                      ...p,
                      judoka_sexe: next,
                      categorie_poids: ensureWeightForSex(next, p.categorie_poids),
                    }));
                  }}
                >
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </label>
              <label>
                Catégorie d&apos;âge
                <select
                  value={resultForm.categorie_age}
                  onChange={(e) => setResultForm((p) => ({ ...p, categorie_age: e.target.value }))}
                >
                  {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>
                Catégorie de poids ({resultForm.judoka_sexe === 'F' ? 'Filles' : 'Garçons'})
                <select
                  required
                  value={resultForm.categorie_poids}
                  onChange={(e) => setResultForm((p) => ({ ...p, categorie_poids: e.target.value }))}
                >
                  {resultWeightOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              <label>
                Compétition
                <input
                  required
                  value={resultForm.competition_name}
                  onChange={(e) => setResultForm((p) => ({ ...p, competition_name: e.target.value }))}
                />
              </label>
              <label>
                Niveau
                <select
                  value={resultForm.competition_level}
                  onChange={(e) => setResultForm((p) => ({ ...p, competition_level: e.target.value }))}
                >
                  {(rules?.levels || []).map((l) => (
                    <option key={l.key} value={l.key}>{l.key} - {l.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Place
                <input
                  type="number"
                  min="0"
                  value={resultForm.place}
                  onChange={(e) => setResultForm((p) => ({ ...p, place: Number(e.target.value) || 0 }))}
                />
              </label>
              <label>
                Victoires
                <input
                  type="number"
                  min="0"
                  value={resultForm.wins}
                  onChange={(e) => setResultForm((p) => ({ ...p, wins: Number(e.target.value) || 0 }))}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={resultForm.competition_date}
                  onChange={(e) => setResultForm((p) => ({ ...p, competition_date: e.target.value }))}
                />
              </label>
            </div>
            <label className="form-group">
              Note
              <input
                value={resultForm.note}
                onChange={(e) => setResultForm((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer le résultat'}
            </button>
          </form>
        </section>
      )}

      {editAthlete && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setEditAthlete(null)}>
          <div className="ranking-edit-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Modifier l&apos;athlète Ranking</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditAthlete(null)}>Fermer</button>
            </header>
            <form onSubmit={handleSaveAthlete}>
              <div className="ranking-form-grid">
                <label>
                  Prénom
                  <input
                    required
                    value={editAthlete.judoka_prenom}
                    onChange={(e) => setEditAthlete((p) => ({ ...p, judoka_prenom: e.target.value }))}
                  />
                </label>
                <label>
                  Nom
                  <input
                    required
                    value={editAthlete.judoka_nom}
                    onChange={(e) => setEditAthlete((p) => ({ ...p, judoka_nom: e.target.value }))}
                  />
                </label>
                <label>
                  Club
                  <input
                    value={editAthlete.judoka_club}
                    onChange={(e) => setEditAthlete((p) => ({ ...p, judoka_club: e.target.value }))}
                  />
                </label>
                <label>
                  Sexe
                  <select
                    value={editAthlete.judoka_sexe}
                    onChange={(e) => {
                      const next = e.target.value;
                      setEditAthlete((p) => ({
                        ...p,
                        judoka_sexe: next,
                        categorie_poids: ensureWeightForSex(next, p.categorie_poids),
                      }));
                    }}
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </label>
                <label>
                  Catégorie d&apos;âge
                  <select
                    value={editAthlete.categorie_age}
                    onChange={(e) => setEditAthlete((p) => ({ ...p, categorie_age: e.target.value }))}
                  >
                    {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label>
                  Catégorie de poids
                  <select
                    required
                    value={editAthlete.categorie_poids}
                    onChange={(e) => setEditAthlete((p) => ({ ...p, categorie_poids: e.target.value }))}
                  >
                    {editWeightOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
              </div>
              <div className="ranking-edit-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditAthlete(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {levelDraft && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setLevelDraft(null)}>
          <div className="ranking-edit-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{levelDraft.mode === 'edit' ? 'Modifier le niveau' : 'Ajouter un niveau'}</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setLevelDraft(null)}>Fermer</button>
            </header>
            <div className="ranking-form-grid">
              <label>
                Clé
                <input
                  value={levelDraft.key}
                  onChange={(e) => setLevelDraft((p) => ({ ...p, key: e.target.value.toUpperCase() }))}
                  maxLength={4}
                  placeholder="A"
                />
              </label>
              <label>
                Libellé
                <input
                  value={levelDraft.label}
                  onChange={(e) => setLevelDraft((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Championnat national"
                />
              </label>
              <label>
                Points
                <input
                  type="number"
                  min="0"
                  value={levelDraft.points}
                  onChange={(e) => setLevelDraft((p) => ({ ...p, points: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <div className="ranking-edit-actions">
              <button type="button" className="btn btn-outline" onClick={() => setLevelDraft(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={saveLevelDraft}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {coeffDraft && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setCoeffDraft(null)}>
          <div className="ranking-edit-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{coeffDraft.mode === 'edit' ? 'Modifier le coefficient' : 'Ajouter un coefficient'}</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCoeffDraft(null)}>Fermer</button>
            </header>
            <div className="ranking-form-grid">
              <label>
                Libellé
                <input
                  value={coeffDraft.label}
                  onChange={(e) => setCoeffDraft((p) => ({ ...p, label: e.target.value }))}
                  placeholder="1er - Médaille d'or"
                />
              </label>
              <label>
                Place
                <input
                  type="number"
                  value={coeffDraft.place}
                  onChange={(e) => setCoeffDraft((p) => ({ ...p, place: Number(e.target.value) || 0 }))}
                />
              </label>
              <label>
                Pourcentage
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={coeffDraft.percent}
                  onChange={(e) => setCoeffDraft((p) => ({ ...p, percent: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <div className="ranking-edit-actions">
              <button type="button" className="btn btn-outline" onClick={() => setCoeffDraft(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={saveCoeffDraft}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
