import { useState, useEffect } from 'react';
import {
  fetchPublicCompetition,
  lookupPublicCompetitionJudoka,
  registerPublicCompetition,
  GRADES,
  CATEGORIES,
} from '../api';

const emptyForm = () => ({
  nom: '',
  prenom: '',
  date_naissance: '',
  sexe: 'M',
  club: '',
  grade: 'Blanche',
  categorie: '',
  telephone: '',
  email: '',
});

const TEAM_MIN_CATEGORIES = 3;

function emptySlot() {
  return { nom: '', prenom: '' };
}

function emptyRoster(cats) {
  const next = {};
  (cats || []).forEach((cat) => {
    next[cat] = { principal: emptySlot(), remplacant: emptySlot() };
  });
  return next;
}

function slotFilled(slot) {
  return Boolean(String(slot?.nom || '').trim() && String(slot?.prenom || '').trim());
}

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
        nom: judoka.nom || '',
        prenom: judoka.prenom || '',
        date_naissance: judoka.date_naissance || '',
        sexe: judoka.sexe || 'M',
        club: judoka.club || '',
        grade: judoka.grade || 'Blanche',
        categorie: judoka.categorie || '',
        telephone: judoka.telephone || '',
        email: judoka.email || '',
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

  const updateTeamSlot = (cat, role, field, value) => {
    setTeamRoster((prev) => ({
      ...prev,
      [cat]: {
        ...(prev[cat] || { principal: emptySlot(), remplacant: emptySlot() }),
        [role]: {
          ...(prev[cat]?.[role] || emptySlot()),
          [field]: value,
        },
      },
    }));
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
  const weightCats = Array.isArray(competition.categories_poids) ? competition.categories_poids : [];
  const filledTeamCats = weightCats.filter((cat) => slotFilled(teamRoster[cat]?.principal)).length;

  const resetFlow = () => {
    setStep('mode');
    setInscriptionMode('');
    setForm(emptyForm());
    setTeamClub('');
    setTeamRoster({});
    setJudokaMeta(null);
    setCardId('');
    setSuccessName('');
    setError('');
  };

  const chooseMode = (mode) => {
    setInscriptionMode(mode);
    setError('');
    if (mode === 'equipe') {
      if (weightCats.length < TEAM_MIN_CATEGORIES) {
        setError('Le Directeur de Compétition doit définir au moins 3 catégories de poids pour le mode Par équipe.');
        return;
      }
      setTeamClub('');
      setTeamRoster(emptyRoster(weightCats));
      setStep('team');
      return;
    }
    setStep('choice');
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const members = [];
      for (const cat of weightCats) {
        const principal = teamRoster[cat]?.principal;
        const remplacant = teamRoster[cat]?.remplacant;
        if (slotFilled(remplacant) && !slotFilled(principal)) {
          throw new Error(`Indiquez le Principal avant le Remplaçant en ${cat} kg`);
        }
        if (slotFilled(principal)) {
          members.push({
            nom: principal.nom.trim(),
            prenom: principal.prenom.trim(),
            poids: cat,
            role_equipe: 'principal',
          });
        }
        if (slotFilled(remplacant)) {
          members.push({
            nom: remplacant.nom.trim(),
            prenom: remplacant.prenom.trim(),
            poids: cat,
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
                    <label htmlFor="nom">Nom *</label>
                    <input id="nom" name="nom" value={form.nom} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prenom">Prénom *</label>
                    <input id="prenom" name="prenom" value={form.prenom} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
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
                    <label htmlFor="sexe">Sexe *</label>
                    <select id="sexe" name="sexe" value={form.sexe} onChange={handleChange} disabled={Boolean(judokaMeta)}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="club">Club *</label>
                    <input id="club" name="club" value={form.club} onChange={handleChange} required readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="grade">Grade</label>
                    <select id="grade" name="grade" value={form.grade} onChange={handleChange} disabled={Boolean(judokaMeta)}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
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
                  <div className="form-group">
                    <label htmlFor="telephone">Téléphone</label>
                    <input id="telephone" name="telephone" value={form.telephone} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input id="email" type="email" name="email" value={form.email} onChange={handleChange} />
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
                <h2>Enregistrement Equipe</h2>
                <p className="form-hint">
                  Saisissez le nom du club, puis un Principal et un Remplaçant par catégorie de poids.
                  Le club peut participer s&apos;il a des judokas dans au moins {TEAM_MIN_CATEGORIES} catégories.
                </p>
                <p className="form-hint">
                  Catégories couvertes : <strong>{filledTeamCats}/{TEAM_MIN_CATEGORIES}</strong>
                </p>

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

                <div className="competition-team-cats">
                  {weightCats.map((cat) => (
                    <section key={cat} className="competition-team-cat">
                      <h3>{cat} kg</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor={`p-nom-${cat}`}>Principal · Nom</label>
                          <input
                            id={`p-nom-${cat}`}
                            value={teamRoster[cat]?.principal?.nom || ''}
                            onChange={(e) => updateTeamSlot(cat, 'principal', 'nom', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`p-prenom-${cat}`}>Principal · Prénom</label>
                          <input
                            id={`p-prenom-${cat}`}
                            value={teamRoster[cat]?.principal?.prenom || ''}
                            onChange={(e) => updateTeamSlot(cat, 'principal', 'prenom', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`r-nom-${cat}`}>Remplaçant · Nom</label>
                          <input
                            id={`r-nom-${cat}`}
                            value={teamRoster[cat]?.remplacant?.nom || ''}
                            onChange={(e) => updateTeamSlot(cat, 'remplacant', 'nom', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`r-prenom-${cat}`}>Remplaçant · Prénom</label>
                          <input
                            id={`r-prenom-${cat}`}
                            value={teamRoster[cat]?.remplacant?.prenom || ''}
                            onChange={(e) => updateTeamSlot(cat, 'remplacant', 'prenom', e.target.value)}
                          />
                        </div>
                      </div>
                    </section>
                  ))}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-outline" onClick={resetFlow}>
                    Retour
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
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
      </div>
    </div>
  );
}
