import { useEffect, useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import {
  createRankingResult,
  fetchRankingBoard,
  fetchRankingRules,
  updateRankingRules,
} from '../api';

const AGE_OPTIONS = ['Minimes', 'Cadets', 'Juniors', 'Seniors'];
const WEIGHT_OPTIONS = [
  '-48 kg', '-52 kg', '-57 kg', '-63 kg', '-70 kg', '-78 kg', '+78 kg',
  '-60 kg', '-66 kg', '-73 kg', '-81 kg', '-90 kg', '-100 kg', '+100 kg',
];

export default function RankingPage({ user, onToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [board, setBoard] = useState([]);
  const [rules, setRules] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [season, setSeason] = useState('');
  const [sexe, setSexe] = useState('');
  const [categorieAge, setCategorieAge] = useState('Seniors');
  const [categoriePoids, setCategoriePoids] = useState('');
  const [tab, setTab] = useState('board');
  const [resultForm, setResultForm] = useState({
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
  });

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
      setResultForm((prev) => ({
        ...prev,
        judoka_prenom: '',
        judoka_nom: '',
        competition_name: '',
        note: '',
      }));
      setTab('board');
      await load();
    } catch (err) {
      onToast?.(err.message || 'Enregistrement impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateLevel = (idx, patch) => {
    setRules((prev) => {
      const levelsNext = [...(prev.levels || [])];
      levelsNext[idx] = { ...levelsNext[idx], ...patch };
      return { ...prev, levels: levelsNext };
    });
  };

  const updateCoeff = (idx, patch) => {
    setRules((prev) => {
      const next = [...(prev.result_coefficients || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, result_coefficients: next };
    });
  };

  return (
    <div className="ranking-page">
      <header className="ranking-head">
        <div>
          <p className="sa-kicker">Classement</p>
          <h2>Ranking</h2>
          <p className="form-hint">
            Classement des athlètes par points
            {season ? ` - ${season}` : ''}.
            {user?.type === 'ligue' ? ' Périmètre : votre ligue.' : ''}
            {user?.type === 'entente' ? ' Périmètre : votre entente.' : ''}
            {user?.type === 'club' ? ' Périmètre : votre club.' : ''}
          </p>
        </div>
        <div className="ranking-tabs">
          <button
            type="button"
            className={`btn btn-sm ${tab === 'board' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('board')}
          >
            Classement
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={`btn btn-sm ${tab === 'rules' ? 'btn-primary' : 'btn-outline'}`}
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
                className={`btn btn-sm ${tab === 'result' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTab('result')}
              >
                Ajouter un résultat
              </button>
            </>
          )}
        </div>
      </header>

      {error ? <div className="form-error">{error}</div> : null}

      {tab === 'board' && (
        <>
          <div className="ranking-filters">
            <label>
              <span>Sexe</span>
              <select value={sexe} onChange={(e) => setSexe(e.target.value)}>
                <option value="">Tous</option>
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
              <span>Catégorie de poids</span>
              <select value={categoriePoids} onChange={(e) => setCategoriePoids(e.target.value)}>
                <option value="">Toutes</option>
                {WEIGHT_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
              Actualiser
            </button>
          </div>

          {loading ? (
            <BrandLoader label="Chargement du Ranking…" />
          ) : board.length === 0 ? (
            <p className="form-hint">Aucun athlète classé pour ces filtres.</p>
          ) : (
            <table className="data-table ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Athlète</th>
                  <th>Club</th>
                  <th>Catégorie</th>
                  <th>Or</th>
                  <th>Victoires</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => (
                  <tr key={`${row.rank}-${row.nom}-${row.prenom}-${row.club}`}>
                    <td><strong>{row.rank}</strong></td>
                    <td>
                      <div className="judoka-name">{row.prenom} {row.nom}</div>
                      <div className="judoka-club">{row.sexe === 'F' ? '♀' : '♂'}</div>
                    </td>
                    <td>{row.club || '-'}</td>
                    <td>{row.categorie_age || '-'} · {row.categorie_poids || '-'}</td>
                    <td>{row.gold_medals || 0}</td>
                    <td>{row.wins || 0}</td>
                    <td><strong>{row.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'rules' && canManage && rules && (
        <form className="ranking-rules-form" onSubmit={handleSaveRules}>
          <div className="form-group">
            <label>Saison</label>
            <input
              value={rules.season_label || ''}
              onChange={(e) => setRules((p) => ({ ...p, season_label: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Nombre de meilleures performances comptées</label>
            <input
              type="number"
              min="1"
              max="20"
              value={rules.best_results_count || 4}
              onChange={(e) => setRules((p) => ({ ...p, best_results_count: Number(e.target.value) || 4 }))}
            />
            <p className="form-hint">Par défaut : 4 meilleures performances (règles FCJ).</p>
          </div>

          <h4>Niveaux de compétition</h4>
          <div className="ranking-rules-grid">
            {levels.map((level, idx) => (
              <div key={level.key || idx} className="ranking-rule-card">
                <strong>Niveau {level.key}</strong>
                <input
                  value={level.label}
                  onChange={(e) => updateLevel(idx, { label: e.target.value })}
                />
                <label>
                  Points de base
                  <input
                    type="number"
                    min="0"
                    value={level.points}
                    onChange={(e) => updateLevel(idx, { points: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            ))}
          </div>

          <h4>Coefficients selon le résultat</h4>
          <div className="ranking-rules-grid">
            {coeffs.map((c, idx) => (
              <div key={`${c.place}-${idx}`} className="ranking-rule-card">
                <input
                  value={c.label}
                  onChange={(e) => updateCoeff(idx, { label: e.target.value })}
                />
                <label>
                  Place
                  <input
                    type="number"
                    value={c.place}
                    onChange={(e) => updateCoeff(idx, { place: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={c.percent}
                    onChange={(e) => updateCoeff(idx, { percent: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            ))}
          </div>

          <p className="form-hint">
            Règle : sans victoire effective, seuls les points de participation s&apos;appliquent.
          </p>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer les règles'}
          </button>
        </form>
      )}

      {tab === 'result' && canManage && (
        <form className="ranking-result-form" onSubmit={handleAddResult}>
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
                onChange={(e) => setResultForm((p) => ({ ...p, judoka_sexe: e.target.value }))}
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
              Catégorie de poids
              <select
                required
                value={resultForm.categorie_poids}
                onChange={(e) => setResultForm((p) => ({ ...p, categorie_poids: e.target.value }))}
              >
                {WEIGHT_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
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
      )}
    </div>
  );
}
