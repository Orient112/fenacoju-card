import { useState, useEffect } from 'react';
import {
  fetchPublicCompetition,
  lookupPublicCompetitionJudoka,
  registerPublicCompetition,
  CATEGORIES,
} from '../api';
import CompetitionPaymentModal, { formatMoney } from '../components/CompetitionPaymentModal';
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

function buildTeamRosterFromMembers(members, categories, club, sexe) {
  const cats = categoriesForSexe(categories, sexe);
  const clubKey = String(club || '').trim().toLowerCase();
  const teamSexeKey = sexe === 'F' ? 'F' : 'M';
  const next = {};
  for (const m of members || []) {
    if (m.mode_inscription !== 'equipe') continue;
    if (String(m.club || '').trim().toLowerCase() !== clubKey) continue;
    if ((m.sexe === 'F' ? 'F' : 'M') !== teamSexeKey) continue;
    const cat = cats.find((c) => c.label === String(m.categorie || '').trim())
      || findCategoryForWeight(cats, m.poids, teamSexeKey)
      || (m.categorie || m.poids
        ? {
          key: `${teamSexeKey}|${String(m.categorie || m.poids).trim()}`,
          label: String(m.categorie || m.poids).trim(),
          sexe: teamSexeKey,
          min: 0,
          max: 999,
        }
        : null);
    if (!cat) continue;
    if (!next[cat.key]) next[cat.key] = { cat, principal: null, remplacant: null };
    const role = m.role_equipe === 'remplacant' ? 'remplacant' : 'principal';
    next[cat.key][role] = {
      nom_complet: `${m.prenom || ''} ${m.nom || ''}`.trim(),
      poids: m.poids || '',
      role,
      locked: true,
      registrationId: m.id,
    };
  }
  return next;
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
  const [basket, setBasket] = useState([]);
  const [teamClub, setTeamClub] = useState('');
  const [teamRoster, setTeamRoster] = useState({});
  const [teamEntry, setTeamEntry] = useState(emptyTeamEntry());
  const [teamSexe, setTeamSexe] = useState('');
  const [showTeamSexModal, setShowTeamSexModal] = useState(false);
  const [judokaMeta, setJudokaMeta] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [successCount, setSuccessCount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentKind, setPaymentKind] = useState(null);
  const [paymentItems, setPaymentItems] = useState([]);

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
            competition_clubs: data.competition_clubs,
            frais_individuel: data.frais_individuel,
            frais_equipe: data.frais_equipe,
            frais_monnaie: data.frais_monnaie,
            frais_individuel_cdf: data.frais_individuel_cdf,
            frais_individuel_usd: data.frais_individuel_usd,
            frais_equipe_cdf: data.frais_equipe_cdf,
            frais_equipe_usd: data.frais_equipe_usd,
            team_counts: data.team_counts,
            team_members: data.team_members,
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

  useEffect(() => {
    if (step !== 'team' || !teamClub || !teamSexe) return;
    const next = buildTeamRosterFromMembers(
      competition?.team_members,
      competition?.categories_poids,
      teamClub,
      teamSexe
    );
    setTeamRoster((prev) => {
      const merged = { ...next };
      for (const [key, bucket] of Object.entries(prev || {})) {
        if (!merged[key]) {
          merged[key] = {
            cat: bucket.cat,
            principal: bucket.principal && !bucket.principal.locked ? bucket.principal : null,
            remplacant: bucket.remplacant && !bucket.remplacant.locked ? bucket.remplacant : null,
          };
          if (!merged[key].principal && !merged[key].remplacant) delete merged[key];
          continue;
        }
        if (bucket.principal && !bucket.principal.locked && !merged[key].principal) {
          merged[key] = { ...merged[key], principal: bucket.principal };
        }
        if (bucket.remplacant && !bucket.remplacant.locked && !merged[key].remplacant) {
          merged[key] = { ...merged[key], remplacant: bucket.remplacant };
        }
      }
      return merged;
    });
  }, [competition?.team_members, competition?.categories_poids, teamClub, teamSexe, step]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const fraisMonnaie = String(competition?.frais_monnaie || '').toUpperCase() === 'USD' ? 'USD' : 'CDF';
  const fraisIndividuel = Math.max(0, Number(
    fraisMonnaie === 'USD'
      ? (competition?.frais_individuel_usd ?? competition?.frais_individuel)
      : (competition?.frais_individuel_cdf ?? competition?.frais_individuel)
  ) || 0);
  const fraisEquipe = Math.max(0, Number(
    fraisMonnaie === 'USD'
      ? (competition?.frais_equipe_usd ?? competition?.frais_equipe)
      : (competition?.frais_equipe_cdf ?? competition?.frais_equipe)
  ) || 0);
  const fraisIndividuelCdf = Math.max(0, Number(competition?.frais_individuel_cdf ?? competition?.frais_individuel) || 0);
  const fraisIndividuelUsd = Math.max(0, Number(competition?.frais_individuel_usd) || 0);
  const fraisEquipeCdf = Math.max(0, Number(competition?.frais_equipe_cdf ?? competition?.frais_equipe) || 0);
  const fraisEquipeUsd = Math.max(0, Number(competition?.frais_equipe_usd) || 0);

  const resetFlow = () => {
    setStep('mode');
    setInscriptionMode('');
    setCardId('');
    setJudokaMeta(null);
    setForm(emptyForm());
    setBasket([]);
    setTeamClub('');
    setTeamRoster({});
    setTeamEntry(emptyTeamEntry());
    setTeamSexe('');
    setShowTeamSexModal(false);
    setSuccessName('');
    setSuccessCount(0);
    setShowPayment(false);
    setPaymentKind(null);
    setPaymentItems([]);
    setError('');
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

  const chooseMode = (mode) => {
    setInscriptionMode(mode);
    setError('');
    setBasket([]);
    if (mode === 'equipe') {
      setShowTeamSexModal(true);
      return;
    }
    setStep('choice');
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

  const buildIndividuelPayload = () => ({
    ...form,
    deja_enregistre: Boolean(judokaMeta),
    judoka_id: judokaMeta?.id || null,
    numero_carte: judokaMeta ? (judokaMeta.numero_carte || cardId.trim() || '') : '',
    mode_inscription: 'individuel',
    poids: '',
  });

  const addToBasket = (e) => {
    e.preventDefault();
    setError('');
    if (!form.club?.trim() || !form.nom?.trim() || !form.prenom?.trim() || !form.date_naissance) {
      setError('Complétez les champs obligatoires avant d\'ajouter');
      return;
    }
    const payload = buildIndividuelPayload();
    const key = [
      payload.nom, payload.prenom, payload.date_naissance, payload.club,
      payload.judoka_id || payload.numero_carte || '',
    ].join('|').toLowerCase();
    if (basket.some((item) => item._key === key)) {
      setError('Ce judoka est déjà dans la liste d\'inscription');
      return;
    }
    setBasket((prev) => [...prev, { ...payload, _key: key }]);
    setJudokaMeta(null);
    setCardId('');
    setForm((prev) => ({ ...emptyForm(), club: prev.club }));
    setStep('form');
  };

  const removeFromBasket = (key) => {
    setBasket((prev) => prev.filter((item) => item._key !== key));
  };

  const openIndividuelPayment = (e) => {
    e.preventDefault();
    setError('');
    let list = [...basket];
    if (form.nom?.trim() && form.prenom?.trim() && form.club?.trim() && form.date_naissance) {
      const payload = buildIndividuelPayload();
      const key = [
        payload.nom, payload.prenom, payload.date_naissance, payload.club,
        payload.judoka_id || payload.numero_carte || '',
      ].join('|').toLowerCase();
      if (!list.some((item) => item._key === key)) {
        list = [...list, { ...payload, _key: key }];
      }
    }
    if (!list.length) {
      setError('Ajoutez au moins un judoka avant de valider l\'inscription');
      return;
    }
    setBasket(list);
    setPaymentItems(list);
    setPaymentKind('individuel');
    setShowPayment(true);
  };

  const confirmIndividuelPayment = async (paiement) => {
    setSubmitting(true);
    setError('');
    try {
      const batch = (paymentItems.length ? paymentItems : basket).map(({ _key, ...rest }) => rest);
      const result = await registerPublicCompetition(token, {
        mode_inscription: 'individuel',
        batch,
        paiement,
      });
      const count = result.count || batch.length;
      setSuccessName(batch.length === 1
        ? `${batch[0].prenom} ${batch[0].nom}`.trim()
        : `${batch.length} judokas`);
      setSuccessCount(count);
      setCompetition((prev) => (prev
        ? { ...prev, registrations_count: (prev.registrations_count || 0) + count }
        : prev));
      setShowPayment(false);
      setPaymentKind(null);
      setPaymentItems([]);
      setBasket([]);
      setStep('success');
    } catch (err) {
      throw err;
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
        [role]: { nom_complet: nomComplet, poids, role },
      },
    }));
    setTeamEntry(emptyTeamEntry());
  };

  const selectTeamSexe = (sexe) => {
    const cats = categoriesForSexe(parseCategoriesPoids(competition?.categories_poids), sexe);
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

  const loadExistingTeamRoster = (club, sexe) => {
    if (!club) {
      setTeamRoster({});
      return;
    }
    setTeamRoster(buildTeamRosterFromMembers(
      competition?.team_members,
      competition?.categories_poids,
      club,
      sexe
    ));
  };

  const openTeamPayment = (e) => {
    e.preventDefault();
    setError('');
    if (!teamClub.trim()) {
      setError('Sélectionnez le club');
      return;
    }
    const filled = Object.values(teamRoster).reduce((sum, b) => (
      sum + (b.principal ? 1 : 0) + (b.remplacant ? 1 : 0)
    ), 0);
    if (filled < 3) {
      setError('Inscrivez au moins 3 judokas pour enregistrer l\'équipe');
      return;
    }
    const hasNew = Object.values(teamRoster).some((b) => (
      (b.principal && !b.principal.locked) || (b.remplacant && !b.remplacant.locked)
    ));
    if (!hasNew) {
      setError('Cette équipe est déjà enregistrée pour ce club');
      return;
    }
    setPaymentKind('equipe');
    setShowPayment(true);
  };

  const confirmTeamPayment = async (paiement) => {
    setSubmitting(true);
    setError('');
    try {
      const members = [];
      let hasLocked = false;
      for (const bucket of Object.values(teamRoster)) {
        if (bucket.principal) {
          if (bucket.principal.locked) {
            hasLocked = true;
          } else {
            const names = splitFullName(bucket.principal.nom_complet);
            members.push({
              ...names,
              nom_complet: bucket.principal.nom_complet,
              poids: bucket.principal.poids,
              role_equipe: 'principal',
            });
          }
        }
        if (bucket.remplacant) {
          if (!bucket.principal) {
            throw new Error(`Indiquez le Principal avant le Remplaçant en ${bucket.cat?.label || ''}`);
          }
          if (bucket.remplacant.locked) {
            hasLocked = true;
          } else {
            const names = splitFullName(bucket.remplacant.nom_complet);
            members.push({
              ...names,
              nom_complet: bucket.remplacant.nom_complet,
              poids: bucket.remplacant.poids,
              role_equipe: 'remplacant',
            });
          }
        }
      }
      if (!members.length) {
        throw new Error('Cette équipe est déjà enregistrée pour ce club');
      }
      const result = await registerPublicCompetition(token, {
        mode_inscription: 'equipe',
        club: teamClub.trim(),
        sexe: teamSexe,
        members,
        allow_existing: hasLocked,
        paiement,
      });
      setSuccessName(teamClub.trim());
      setSuccessCount(result.count || members.length);
      setCompetition((prev) => (prev
        ? { ...prev, registrations_count: (prev.registrations_count || 0) + (result.count || members.length) }
        : prev));
      setShowPayment(false);
      setPaymentKind(null);
      setStep('success');
    } catch (err) {
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="competition-public-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!competition && error) {
    return (
      <div className="competition-public-page">
        <div className="empty-state">
          <h3>Formulaire indisponible</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!competition) return null;

  const count = competition.registrations_count || 0;
  const allWeightCats = parseCategoriesPoids(competition.categories_poids);
  const weightCats = categoriesForSexe(allWeightCats, teamSexe);
  const boyCats = categoriesForSexe(allWeightCats, 'M');
  const girlCats = categoriesForSexe(allWeightCats, 'F');
  const registeredClubs = (competition.competition_clubs || []).filter((c) => (
    inscriptionMode === 'equipe' ? c.cadre === 'equipe' : c.cadre === 'individuel'
  ));
  const equipeClubsFromCompetition = [
    ...(competition.competition_clubs || []).filter((c) => c.cadre === 'equipe').map((c) => c.nom).filter(Boolean),
    ...((competition.team_members || []).map((m) => String(m.club || '').trim()).filter(Boolean)),
  ];
  const namesForSelect = (current) => {
    const names = registeredClubs.map((c) => c.nom).filter(Boolean);
    // Nouvel enregistrement (Individuel) + Enregistrement Equipe : clubs Par Équipe de la page Compétition
    if (inscriptionMode === 'individuel' || inscriptionMode === 'equipe') {
      for (const nom of equipeClubsFromCompetition) {
        if (nom && !names.some((n) => n.toLowerCase() === nom.toLowerCase())) {
          names.push(nom);
        }
      }
    }
    if (current && !names.some((n) => n.toLowerCase() === String(current).toLowerCase())) {
      names.unshift(current);
    }
    return names;
  };
  const filledTeamJudokas = Object.values(teamRoster).reduce((sum, b) => (
    sum + (b.principal ? 1 : 0) + (b.remplacant ? 1 : 0)
  ), 0);
  const judokaCount = Math.max(paymentItems.length || basket.length, 1);
  const individuelAmountCdf = fraisIndividuelCdf * judokaCount;
  const individuelAmountUsd = fraisIndividuelUsd * judokaCount;
  const paymentAmountCdf = paymentKind === 'equipe' ? fraisEquipeCdf : individuelAmountCdf;
  const paymentAmountUsd = paymentKind === 'equipe' ? fraisEquipeUsd : individuelAmountUsd;
  const paymentAmount = paymentKind === 'equipe' ? fraisEquipe : (fraisIndividuel * judokaCount);

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

        {(fraisIndividuelCdf > 0 || fraisIndividuelUsd > 0 || fraisEquipeCdf > 0 || fraisEquipeUsd > 0) && step === 'mode' && (
          <div className="competition-fees-public">
            {(fraisIndividuelCdf > 0 || fraisIndividuelUsd > 0) && (
              <span>
                Individuel :{' '}
                <strong>
                  {fraisIndividuelCdf > 0 ? formatMoney(fraisIndividuelCdf, 'CDF') : null}
                  {fraisIndividuelCdf > 0 && fraisIndividuelUsd > 0 ? ' · ' : ''}
                  {fraisIndividuelUsd > 0 ? formatMoney(fraisIndividuelUsd, 'USD') : null}
                </strong>
                {' '}/ judoka
              </span>
            )}
            {(fraisEquipeCdf > 0 || fraisEquipeUsd > 0) && (
              <span>
                Par équipe :{' '}
                <strong>
                  {fraisEquipeCdf > 0 ? formatMoney(fraisEquipeCdf, 'CDF') : null}
                  {fraisEquipeCdf > 0 && fraisEquipeUsd > 0 ? ' · ' : ''}
                  {fraisEquipeUsd > 0 ? formatMoney(fraisEquipeUsd, 'USD') : null}
                </strong>
                {' '}/ club
              </span>
            )}
          </div>
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
                    Déjà dans le Système
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
              <form className="competition-reg-form form-card" onSubmit={openIndividuelPayment}>
                <h2>{judokaMeta ? 'Confirmer l\'inscription' : 'Nouvel enregistrement'}</h2>
                {judokaMeta && (
                  <p className="form-hint">
                    Données importées depuis la carte <strong>{judokaMeta.numero_carte}</strong>.
                    Vérifiez la catégorie si besoin. Le poids sera saisi à la pesée.
                  </p>
                )}
                {(fraisIndividuelCdf > 0 || fraisIndividuelUsd > 0) && (
                  <p className="form-hint">
                    Frais :{' '}
                    <strong>
                      {fraisIndividuelCdf > 0 ? formatMoney(fraisIndividuelCdf, 'CDF') : null}
                      {fraisIndividuelCdf > 0 && fraisIndividuelUsd > 0 ? ' · ' : ''}
                      {fraisIndividuelUsd > 0 ? formatMoney(fraisIndividuelUsd, 'USD') : null}
                    </strong>
                    {' '}par judoka.
                    {basket.length > 0 ? (
                      <>
                        {' '}Liste actuelle : {basket.length} · Total provisoire{' '}
                        {fraisIndividuelCdf > 0 ? formatMoney(fraisIndividuelCdf * basket.length, 'CDF') : null}
                        {fraisIndividuelCdf > 0 && fraisIndividuelUsd > 0 ? ' · ' : ''}
                        {fraisIndividuelUsd > 0 ? formatMoney(fraisIndividuelUsd * basket.length, 'USD') : null}.
                      </>
                    ) : null}
                  </p>
                )}

                {basket.length > 0 && (
                  <div className="competition-basket">
                    <h3>Judokas à inscrire ({basket.length})</h3>
                    <ul>
                      {basket.map((item) => (
                        <li key={item._key}>
                          <span>{item.prenom} {item.nom} · {item.club}</span>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => removeFromBasket(item._key)}>
                            Retirer
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label htmlFor="club">Club *</label>
                    <select id="club" name="club" value={form.club} onChange={handleChange} required>
                      <option value="">— Sélectionner un club —</option>
                      {namesForSelect(form.club).map((nom) => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                    </select>
                    {namesForSelect(form.club).length === 0 && (
                      <p className="form-hint">Aucun club n&apos;est encore enregistré pour cette compétition.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="nom">Nom *</label>
                    <input id="nom" name="nom" value={form.nom} onChange={handleChange} required={!basket.length} readOnly={Boolean(judokaMeta)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prenom">Prénom *</label>
                    <input id="prenom" name="prenom" value={form.prenom} onChange={handleChange} required={!basket.length} readOnly={Boolean(judokaMeta)} />
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
                      required={!basket.length}
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

                <div className="form-actions competition-form-actions-multi">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setStep(judokaMeta ? 'lookup' : (basket.length ? 'form' : 'choice'))}
                  >
                    Retour
                  </button>
                  <button type="button" className="btn btn-outline" onClick={addToBasket}>
                    Ajouter un judoka
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    Valider l&apos;inscription
                  </button>
                </div>
              </form>
            )}

            {step === 'team' && (
              <form className="competition-reg-form form-card competition-team-form" onSubmit={openTeamPayment}>
                <h2>Enregistrement Equipe · {sexeLabel(teamSexe)}</h2>
                {fraisEquipeCdf > 0 || fraisEquipeUsd > 0 ? (
                  <p className="form-hint">
                    Frais Par équipe :{' '}
                    <strong>
                      {fraisEquipeCdf > 0 ? formatMoney(fraisEquipeCdf, 'CDF') : null}
                      {fraisEquipeCdf > 0 && fraisEquipeUsd > 0 ? ' · ' : ''}
                      {fraisEquipeUsd > 0 ? formatMoney(fraisEquipeUsd, 'USD') : null}
                    </strong>
                    {' '}(par club).
                  </p>
                ) : null}

                <div className="form-group">
                  <label htmlFor="team-club">Nom du club *</label>
                  <select
                    id="team-club"
                    value={teamClub}
                    onChange={(e) => {
                      const nextClub = e.target.value;
                      setTeamClub(nextClub);
                      if (nextClub) loadExistingTeamRoster(nextClub, teamSexe);
                      else setTeamRoster({});
                    }}
                    required
                    autoFocus
                  >
                    <option value="">— Sélectionner un club —</option>
                    {namesForSelect(teamClub).map((nom) => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                  </select>
                  {namesForSelect(teamClub).length === 0 && (
                    <p className="form-hint">Aucun club Par équipe n&apos;est encore enregistré pour cette compétition.</p>
                  )}
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
                      />
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={classifyTeamEntry}>
                    Classer dans la catégorie
                  </button>
                </div>

                <div className="competition-team-roster">
                  {weightCats.map((cat) => {
                    const bucket = teamRoster[cat.key];
                    return (
                      <section key={cat.key} className="competition-team-cat-block">
                        <h4>{cat.label} <span>({cat.min}–{cat.max} kg)</span></h4>
                        {!bucket?.principal && !bucket?.remplacant ? (
                          <p className="form-hint">Aucun judoka classé</p>
                        ) : (
                          <ul>
                            {bucket.principal && (
                              <li>
                                <strong>Principal</strong> — {bucket.principal.nom_complet} ({bucket.principal.poids} kg)
                                {bucket.principal.locked ? (
                                  <span className="badge badge-actif">Chargé</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setTeamRoster((prev) => {
                                      const cur = prev[cat.key];
                                      if (!cur) return prev;
                                      return { ...prev, [cat.key]: { ...cur, principal: null } };
                                    })}
                                  >
                                    Retirer
                                  </button>
                                )}
                              </li>
                            )}
                            {bucket.remplacant && (
                              <li>
                                <strong>Remplaçant</strong> — {bucket.remplacant.nom_complet} ({bucket.remplacant.poids} kg)
                                {bucket.remplacant.locked ? (
                                  <span className="badge badge-actif">Chargé</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setTeamRoster((prev) => {
                                      const cur = prev[cat.key];
                                      if (!cur) return prev;
                                      return { ...prev, [cat.key]: { ...cur, remplacant: null } };
                                    })}
                                  >
                                    Retirer
                                  </button>
                                )}
                              </li>
                            )}
                            {bucket.principal && bucket.remplacant && !bucket.principal.locked && !bucket.remplacant.locked && (
                              <li>
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
                    disabled={submitting || filledTeamJudokas < 3}
                  >
                    Enregistrer l&apos;équipe
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
                <p className="form-hint">
                  {successCount > 0 ? `${successCount} inscription(s) validée(s). ` : ''}
                  {count} judoka{count > 1 ? 's' : ''} inscrit{count > 1 ? 's' : ''} au total.
                </p>
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

        {showPayment && (
          <CompetitionPaymentModal
            title={paymentKind === 'equipe' ? 'Paiement inscription équipe' : 'Paiement inscription individuelle'}
            summary={
              paymentKind === 'equipe'
                ? `Club ${teamClub} · frais forfaitaire par équipe${fraisEquipeCdf > 0 || fraisEquipeUsd > 0 ? ` · ${[fraisEquipeCdf > 0 ? formatMoney(fraisEquipeCdf, 'CDF') : null, fraisEquipeUsd > 0 ? formatMoney(fraisEquipeUsd, 'USD') : null].filter(Boolean).join(' · ')}` : ''}`
                : `${judokaCount} judoka${judokaCount > 1 ? 's' : ''} × ${[
                  fraisIndividuelCdf > 0 ? formatMoney(fraisIndividuelCdf, 'CDF') : null,
                  fraisIndividuelUsd > 0 ? formatMoney(fraisIndividuelUsd, 'USD') : null,
                ].filter(Boolean).join(' · ') || formatMoney(fraisIndividuel, fraisMonnaie)}`
            }
            amount={paymentAmount}
            amountCdf={paymentAmountCdf}
            amountUsd={paymentAmountUsd}
            currency={fraisMonnaie}
            confirmLabel="Payer"
            busy={submitting}
            onClose={() => { if (!submitting) { setShowPayment(false); setPaymentKind(null); } }}
            onConfirm={paymentKind === 'equipe' ? confirmTeamPayment : confirmIndividuelPayment}
          />
        )}
      </div>
    </div>
  );
}
