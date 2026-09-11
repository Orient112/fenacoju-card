import { useState, useEffect } from 'react';
import {
  fetchPublicCompetition,
  lookupPublicCompetitionJudoka,
  registerPublicCompetition,
  CATEGORIES,
} from '../api';

import {
  parseCategoriesPoids,
  categoriesForSexe,
  findCategoryForWeight,
  splitFullName,
  sexeLabel,
} from '../utils/weightCategories';

const emptyForm = () => ({
  club: '',
  nom: '',
  prenom: '',
  date_naissance: '',
  sexe: 'M',
  categorie: '',
});

const TEAM_MIN_CATEGORIES = 3;
const emptyTeamEntry = () => ({ nom_complet: '', role: 'principal', poids: '' });

export default function CompetitionPublicForm({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [competition, setCompetition] = useState(null);
  const [step, setStep] = useState('mode');
  const [inscriptionMode, setInscriptionMode] = useState('');
  const [cardId, setCardId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [teamClub, setTeamClub] = useState('');
  const [teamRoster, setTeamRoster] = useState({});
  const [teamEntry, setTeamEntry] = useState(emptyTeamEntry());
  const [teamSexe, setTeamSexe] = useState('');
  const [showTeamSexModal, setShowTeamSexModal] = useState(false);
  const [judokaMeta, setJudokaMeta] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successName, setSuccessName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchPublicCompetition(token);
        if (!cancelled) setCompetition(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const data = await fetchPublicCompetition(token);
        if (cancelled) return;
        setCompetition((prev) => {
          if (!prev) return data;
          return {
            ...prev,
            ...data,
            registrations_count: data.registrations_count,
            closed: data.closed,
            categories_poids: data.categories_poids,
            team_counts: data.team_counts,
          };
        });
      } catch {
        if (!cancelled) {
          setCompetition((prev) => (prev ? { ...prev, closed: true } : prev));
        }
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, loading]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const startExisting = () => {
    setStep('lookup');
    setError('');
    setCardId('');
    setJudokaMeta(null);
    setForm(emptyForm());
  };

  const startNew = () => {
    setStep('form');
    setError('');
    setCardId('');
    setJudokaMeta(null);
    setForm(emptyForm());
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setLookupLoading(true);
    setError('');
    try {
      const judoka = await lookupPublicCompetitionJudoka(token, cardId.trim());
      setJudokaMeta({
        id: judoka.id,
        numero_carte: judoka.numero_carte,
      });
      setForm({
        club: judoka.club || '',
        nom: judoka.nom || '',
        prenom: judoka.prenom || '',
        date_naissance: judoka.date_naissance || '',
        sexe: judoka.sexe || 'M',
        categorie: judoka.categorie || '',
      });
      setStep('form');
    } catch (err) {
      setError(err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        deja_enregistre: Boolean(judokaMeta),
        judoka_id: judokaMeta?.id || null,
        numero_carte: judokaMeta ? (judokaMeta.numero_carte || cardId.trim() || '') : '',
        mode_inscription: 'individuel',
        poids: '',
      };
      await registerPublicCompetition(token, payload);
      setSuccessName(`${form.prenom} ${form.nom}`.trim());
      setCompetition((prev) => (prev
        ? { ...prev, registrations_count: (prev.registrations_count || 0) + 1 }
        : prev));
      setStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const classifyTeamEntry = () => {
    setError('');
    const nomComplet = String(teamEntry.nom_complet || '').trim();
    const poids = String(teamEntry.poids || '').trim();
    const role = teamEntry.role === 'remplacant' ? 'remplacant' : 'principal';
    if (!nomComplet) {
      setError('Saisissez le nom complet du judoka');
      return;
    }
    if (!poids) {
      setError('Saisissez le poids du judoka');
      return;
    }
    const cat = findCategoryForWeight(weightCats, poids, teamSexe);
    if (!cat) {
      setError(`Aucun seuil de catégorie ne correspond au poids ${poids} kg`);
      return;
    }
    const current = teamRoster[cat.key] || { cat, principal: null, remplacant: null };
    if (current[role]) {
      setError(`Un ${role === 'principal' ? 'Principal' : 'Remplaçant'} est déjà classé en ${cat.label}`);
      return;
    }
    if (role === 'remplacant' && !current.principal) {
      setError(`Classez d'abord le Principal de la catégorie ${cat.label}`);
      return;
    }
    setTeamRoster((prev) => ({
      ...prev,
      [cat.key]: {
        cat,
        principal: current.principal,
        remplacant: current.remplacant,
        [role]: { nom_complet: nomComplet, poids },
      },
    }));
    setTeamEntry(emptyTeamEntry());
  };

  if (loading) {
    return (
      <div className="competition-public-page">
        <div className="page-loader">
          <div className="spinner" />
          <p>Chargement du formulaire...</p>
        </div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="competition-public-page">
        <div className="competition-public-shell">
          <div className="empty-state">
            <h3>Formulaire indisponible</h3>
            <p>{error || 'Cette compétition n\'accepte pas les inscriptions pour le moment.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const count = competition.registrations_count ?? 0;
  const allWeightCats = parseCategoriesPoids(competition.categories_poids);
  const weightCats = teamSexe ? categoriesForSexe(allWeightCats, teamSexe) : [];
  const filledTeamCats = Object.values(teamRoster).filter((bucket) => bucket?.principal).length;
  const boyCats = categoriesForSexe(allWeightCats, 'M');
  const girlCats = categoriesForSexe(allWeightCats, 'F');

  const resetFlow = () => {
    setStep('mode');
    setInscriptionMode('');
    setForm(emptyForm());
    setTeamClub('');
    setTeamRoster({});
    setTeamEntry(emptyTeamEntry());
    setTeamSexe('');
    setShowTeamSexModal(false);
    setJudokaMeta(null);
    setCardId('');
    setSuccessName('');
    setError('');
  };

  const chooseMode = (mode) => {
    setInscriptionMode(mode);
    setError('');
    if (mode === 'equipe') {
      if (boyCats.length < TEAM_MIN_CATEGORIES && girlCats.length < TEAM_MIN_CATEGORIES) {
        setError('Le Directeur de Compétition doit définir au moins 3 catégories Garçon ou Fille pour le mode Par équipe.');
        return;
      }
      setTeamClub('');
      setTeamRoster({});
      setTeamEntry(emptyTeamEntry());
      setTeamSexe('');
      setShowTeamSexModal(true);
      return;
    }
    setShowTeamSexModal(false);
    setStep('choice');
  };

  const selectTeamSexe = (sexe) => {
    const cats = categoriesForSexe(allWeightCats, sexe);
    if (cats.length < TEAM_MIN_CATEGORIES) {
      setError(`Au moins ${TEAM_MIN_CATEGORIES} catégories ${sexeLabel(sexe)} doivent être définies.`);
      return;
    }
    setError('');
    setTeamSexe(sexe);
    setShowTeamSexModal(false);
    setTeamClub('');
    setTeamRoster({});
    setTeamEntry(emptyTeamEntry());
    setStep('team');
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const members = [];
      for (const bucket of Object.values(teamRoster)) {
        if (bucket.principal) {
          const names = splitFullName(bucket.principal.nom_complet);
          members.push({
            ...names,
            nom_complet: bucket.principal.nom_complet,
            poids: bucket.principal.poids,
            role_equipe: 'principal',
          });
        }
        if (bucket.remplacant) {
          if (!bucket.principal) {
            throw new Error(`Indiquez le Principal avant le Remplaçant en ${bucket.cat?.label || ''}`);
          }
          const names = splitFullName(bucket.remplacant.nom_complet);
          members.push({
            ...names,
            nom_complet: bucket.remplacant.nom_complet,
            poids: bucket.remplacant.poids,
            role_equipe: 'remplacant',
          });
        }
      }
      if (filledTeamCats < TEAM_MIN_CATEGORIES) {
        throw new Error(`Inscrivez des judokas dans au moins ${TEAM_MIN_CATEGORIES} catégories de poids`);
      }
      const result = await registerPublicCompetition(token, {
        mode_inscription: 'equipe',
        club: teamClub.trim(),
        sexe: teamSexe,
        members,
      });
      setSuccessName(teamClub.trim());
      setCompetition((prev) => (prev
        ? { ...prev, registrations_count: (prev.registrations_count || 0) + (result.count || members.length) }
        : prev));
      setStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="competition-public-page">
      <div className="competition-public-shell">
        <header className="competition-public-brand">
          <img src="/fenacoju-logo.png" alt="FENACOJU" width="56" height="56" />
          <div className="competition-public-brand-text">
            <p className="competition-public-kicker">FENACOJU</p>
            <h1>{competition.nom}</h1>
            <p>
              {competition.lieu}
              {competition.date_debut
                ? ` · ${new Date(competition.date_debut).toLocaleDateString('fr-FR')}`
                : ''}
              {competition.date_fin
                ? ` → ${new Date(competition.date_fin).toLocaleDateString('fr-FR')}`
                : ''}
            </p>
          </div>
          <div className="competition-count-badge" title="Judokas déjà inscrits">
            <strong>{count}</strong>
            <span>inscrit{count > 1 ? 's' : ''}</span>
          </div>
        </header>

        {competition.description && (
          <p className="competition-public-desc">{competition.description}</p>
        )}

        {error && step !== 'success' && <div className="form-error">{error}</div>}

        {competition.closed ? (
          <div className="empty-state competition-success">
            <h3>Les Inscriptions sont clôturées</h3>
            <p>
              Les inscriptions à <strong>{competition.nom}</strong> ne sont plus ouvertes.
            </p>
            <p className="form-hint">{count} judoka{count > 1 ? 's' : ''} déjà inscrit{count > 1 ? 's' : ''}.</p>
          </div>
        ) : (
          <>
            {step === 'mode' && (
              <div className="competition-choice">
                <h2>Inscription à la compétition</h2>
                <p>Choisissez d&apos;abord le cadre de participation.</p>
                <div className="competition-choice-actions">
                  <button type="button" className="btn btn-primary competition-choice-btn" onClick={() => chooseMode('individuel')}>
                    Individuel
                  </button>
                  <button type="button" className="btn btn-outline competition-choice-btn" onClick={() => chooseMode('equipe')}>
                    Par équipe
                  </button>
                </div>
              </div>
            )}

            {step === 'choice' && (
              <div className="competition-choice">
                <h2>Individuel</h2>
                <p>Le judoka est-il déjà enregistré dans le système FENACOJU ?</p>
                <div className="competition-choice-actions">
                  <button type="button" className="btn btn-primary competition-choice-btn" onClick={startExisting}>
                    Déjà enregistré
                  </button>
                  <button type="button" className="btn btn-outline competition-choice-btn" onClick={startNew}>
                    Pas encore dans le Système
                  </button>
                </div>
                <div className="form-actions" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn btn-outline" onClick={resetFlow}>
                    Retour
                  </button>
                </div>
              </div>
            )}

            {step === 'lookup' && (
              <form className="competition-lookup form-card" onSubmit={handleLookup}>
                <h2>Judoka déjà enregistré</h2>
                <p>Saisissez votre n° de carte FENACOJU pour importer vos données.</p>
                <div className="form-group">
                  <label htmlFor="card-id">ID / N° de carte</label>
                  <input
                    id="card-id"
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                    placeholder="Ex. FCJ-2026-0001"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setStep('choice')}>
                    Retour
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={lookupLoading}>
                    {lookupLoading ? 'Recherche...' : 'Importer les données'}
                  </button>
                </div>
              </form>
            )}

            {step === 'form' && (
              <form className="competition-reg-form form-card" onSubmit={handleSubmit}>
                <h2>{judokaMeta ? 'Confirmer l\'inscription' : 'Nouvel enregistrement'}</h2>
                {judokaMeta && (
                  <p className="form-hint">
                    Données importées depuis la carte <strong>{judokaMeta.numero_carte}</strong>.
                    Vérifiez la catégorie si besoin. Le poids sera saisi à la pesée.
                  </p>
                )}

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="club">Club *</label>
                    <input id="club" name="club" value={form.club} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="nom">Nom *</label>
                    <input id="nom" name="nom" value={form.nom} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prenom">Prénom *</label>
                    <input id="prenom" name="prenom" value={form.prenom} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="sexe">Sexe *</label>
                    <select id="sexe" name="sexe" value={form.sexe} onChange={handleChange} disabled={Boolean(judokaMeta)}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="date_naissance">Date de naissance *</label>
                    <input
                      id="date_naissance"
                      type="date"
                      name="date_naissance"
                      value={form.date_naissance}
                      onChange={handleChange}
                      required
                      readOnly={Boolean(judokaMeta)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="categorie">Catégorie</label>
                    <select id="categorie" name="categorie" value={form.categorie} onChange={handleChange}>
                      <option value="">— Sélectionner —</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setStep(judokaMeta ? 'lookup' : 'choice')}
                  >
                    Retour
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Envoi...' : 'Valider l\'inscription'}
                  </button>
                </div>
              </form>
            )}

            {step === 'team' && (
              <form className="competition-reg-form form-card" onSubmit={handleTeamSubmit}>
                <h2>Enregistrement Equipe · {sexeLabel(teamSexe)}</h2>

                <div className="form-group">
                  <label htmlFor="team-club">Nom du club *</label>
                  <input
                    id="team-club"
                    value={teamClub}
                    onChange={(e) => setTeamClub(e.target.value)}
                    required
                    placeholder="Ex. Club Judo Kinshasa"
                    autoFocus
                  />
                </div>

                <div className="competition-team-entry">
                  <h3>Ajouter un judoka</h3>
                  <div className="form-grid">
                    <div className="form-group form-group-full">
                      <label htmlFor="team-nom-complet">Nom complet</label>
                      <input
                        id="team-nom-complet"
                        value={teamEntry.nom_complet}
                        onChange={(e) => setTeamEntry((prev) => ({ ...prev, nom_complet: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); classifyTeamEntry(); } }}
                        placeholder="Ex. Jean Mukendi"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="team-role">Rôle</label>
                      <select
                        id="team-role"
                        value={teamEntry.role}
                        onChange={(e) => setTeamEntry((prev) => ({ ...prev, role: e.target.value }))}
                      >
                        <option value="principal">Principal</option>
                        <option value="remplacant">Remplaçant</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="team-poids">Poids (kg)</label>
                      <input
                        id="team-poids"
                        value={teamEntry.poids}
                        onChange={(e) => setTeamEntry((prev) => ({ ...prev, poids: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); classifyTeamEntry(); } }}
                        placeholder="Ex. 57"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={classifyTeamEntry}>
                    Valider
                  </button>
                </div>

                <div className="competition-team-cats">
                  {weightCats.map((cat) => {
                    const bucket = teamRoster[cat.key];
                    return (
                      <section key={cat.key} className="competition-team-cat">
                        <h3>{cat.label}</h3>
                        {!bucket?.principal && !bucket?.remplacant ? (
                          <p className="form-hint">Aucun judoka classé dans cette catégorie pour le moment.</p>
                        ) : (
                          <ul className="competition-team-classified">
                            {bucket?.principal && (
                              <li>
                                <strong>Principal</strong> · {bucket.principal.nom_complet} ({bucket.principal.poids} kg)
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setTeamRoster((prev) => {
                                    const next = { ...prev };
                                    const cur = { ...next[cat.key], principal: null };
                                    if (!cur.principal && !cur.remplacant) delete next[cat.key];
                                    else next[cat.key] = cur;
                                    return next;
                                  })}
                                >
                                  Retirer
                                </button>
                              </li>
                            )}
                            {bucket?.remplacant && (
                              <li>
                                <strong>Remplaçant</strong> · {bucket.remplacant.nom_complet} ({bucket.remplacant.poids} kg)
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setTeamRoster((prev) => {
                                    const next = { ...prev };
                                    const cur = { ...next[cat.key], remplacant: null };
                                    if (!cur.principal && !cur.remplacant) delete next[cat.key];
                                    else next[cat.key] = cur;
                                    return next;
                                  })}
                                >
                                  Retirer
                                </button>
                              </li>
                            )}
                            {bucket?.principal && bucket?.remplacant && (
                              <li className="competition-team-swap">
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setTeamRoster((prev) => {
                                    const cur = prev[cat.key];
                                    if (!cur?.principal || !cur?.remplacant) return prev;
                                    return {
                                      ...prev,
                                      [cat.key]: {
                                        ...cur,
                                        principal: cur.remplacant,
                                        remplacant: cur.principal,
                                      },
                                    };
                                  })}
                                >
                                  Permuter Principal / Remplaçant
                                </button>
                              </li>
                            )}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={resetFlow}>
                    Retour
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || filledTeamCats < TEAM_MIN_CATEGORIES}
                  >
                    {submitting ? 'Envoi...' : 'Enregistrer l\'équipe'}
                  </button>
                </div>
              </form>
            )}

            {step === 'success' && (
              <div className="empty-state competition-success">
                <h3>Inscription enregistrée</h3>
                <p>
                  {inscriptionMode === 'equipe'
                    ? <>L&apos;équipe du club <strong>{successName}</strong> est inscrite à <strong>{competition.nom}</strong>.</>
                    : <>{successName || 'Le judoka'} est inscrit(e) à <strong>{competition.nom}</strong>.</>}
                </p>
                <p className="form-hint">{count} judoka{count > 1 ? 's' : ''} inscrit{count > 1 ? 's' : ''} au total.</p>
                <button type="button" className="btn btn-primary" onClick={resetFlow}>
                  Nouvelle inscription
                </button>
              </div>
            )}
          </>
        )}

        {showTeamSexModal && (
          <div
            className="confirm-overlay"
            onClick={() => setShowTeamSexModal(false)}
          >
            <div className="competition-draw-mode-modal" onClick={(e) => e.stopPropagation()}>
              <div className="competition-params-modal-head">
                <div>
                  <h3>Sexe</h3>
                  <p className="form-hint">Choisissez le sexe de l&apos;équipe à enregistrer.</p>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowTeamSexModal(false)}>
                  Fermer
                </button>
              </div>
              <div className="competition-draw-mode-actions">
                <button
                  type="button"
                  className="btn btn-primary competition-draw-mode-btn"
                  disabled={boyCats.length < TEAM_MIN_CATEGORIES}
                  onClick={() => selectTeamSexe('M')}
                >
                  Garçon
                </button>
                <button
                  type="button"
                  className="btn btn-outline competition-draw-mode-btn"
                  disabled={girlCats.length < TEAM_MIN_CATEGORIES}
                  onClick={() => selectTeamSexe('F')}
                >
                  Fille
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
