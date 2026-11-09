import { useMemo, useState } from 'react';
import {
  GRADES,
  GRADES_CLUB,
  gradeRank,
  isBlackBeltGrade,
  isMarronOrBlackGrade,
  nextBlackBeltGrade,
  requestBlackBeltPassation,
  updateJudoka,
} from '../api';

function todayInputValue() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function GradePassationModal({
  judoka,
  onClose,
  onSuccess,
  onRequestSent,
  mode = 'full', // full | club | black
  entraineurs = [],
  allowBlackBelts = false,
  canRequestBlackBelt = false,
}) {
  const canUseBlack = allowBlackBelts || mode === 'full' || mode === 'black';
  const currentRank = gradeRank(judoka.grade);

  const allowedGrades = useMemo(() => {
    let list;
    if (mode === 'black') list = GRADES.filter((g) => isBlackBeltGrade(g));
    else if (canUseBlack) list = [...GRADES];
    else list = [...GRADES_CLUB];
    // Club Marron/Noir : proposer les ceintures noires supérieures pour la Demande
    if (canRequestBlackBelt && isMarronOrBlackGrade(judoka.grade)) {
      GRADES.filter((g) => isBlackBeltGrade(g) && gradeRank(g) > currentRank).forEach((g) => {
        if (!list.includes(g)) list.push(g);
      });
    }
    return list;
  }, [mode, canUseBlack, canRequestBlackBelt, judoka.grade, currentRank]);

  const nextSuggested = useMemo(() => {
    if (isMarronOrBlackGrade(judoka.grade)) {
      return nextBlackBeltGrade(judoka.grade) || judoka.grade;
    }
    const idx = allowedGrades.indexOf(judoka.grade);
    if (idx >= 0 && idx < allowedGrades.length - 1) return allowedGrades[idx + 1];
    return allowedGrades.find((g) => gradeRank(g) > currentRank) || allowedGrades[0] || judoka.grade || 'Blanche';
  }, [allowedGrades, judoka.grade, currentRank]);

  const [reussi, setReussi] = useState(true);
  const [grade, setGrade] = useState(
    allowedGrades.includes(nextSuggested) ? nextSuggested : (allowedGrades[0] || judoka.grade || 'Blanche')
  );
  const [datePassation, setDatePassation] = useState(todayInputValue());
  const [instructeurId, setInstructeurId] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const targetGrade = reussi ? grade : (judoka.grade || '');
  const needsBlackExtras = reussi && canUseBlack && isBlackBeltGrade(targetGrade);
  const showDemande = canRequestBlackBelt
    && isMarronOrBlackGrade(judoka.grade)
    && Boolean(nextBlackBeltGrade(judoka.grade));
  const demandeGrade = isBlackBeltGrade(grade) && gradeRank(grade) > currentRank
    ? grade
    : nextBlackBeltGrade(judoka.grade);

  const isLowerOrEqualGrade = (g) => {
    const rank = gradeRank(g);
    if (rank < 0 || currentRank < 0) return g === judoka.grade;
    return rank <= currentRank;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!datePassation) {
      setError('Indiquez la date de passation');
      return;
    }
    if (reussi) {
      if (!grade || grade === judoka.grade || isLowerOrEqualGrade(grade) && grade === judoka.grade) {
        setError('Choisissez une ceinture supérieure différente du grade actuel');
        return;
      }
      if (gradeRank(grade) <= currentRank && currentRank >= 0) {
        setError('Impossible de sélectionner une ceinture inférieure ou égale');
        return;
      }
      if (!canUseBlack && isBlackBeltGrade(grade)) {
        setError('Pour la ceinture noire, utilisez le bouton Demande');
        return;
      }
      if (needsBlackExtras && !instructeurId) {
        setError('Désignez un instructeur pour l\'examen ceinture noire');
        return;
      }
    }

    const instructeur = entraineurs.find((x) => String(x.id) === String(instructeurId));
    const instructeurNom = instructeur
      ? `${instructeur.prenom || ''} ${instructeur.nom || ''}`.trim() || instructeur.nom_club || ''
      : '';

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('passation_grade', '1');
      formData.append('passation_reussie', reussi ? '1' : '0');
      formData.append('grade', reussi ? grade : (judoka.grade || ''));
      formData.append('date_passation', datePassation);
      if (instructeurId) formData.append('instructeur_id', instructeurId);
      if (instructeurNom) formData.append('instructeur_nom', instructeurNom);
      if (points !== '') formData.append('points', points);
      if (note.trim()) formData.append('note', note.trim());
      const updated = await updateJudoka(judoka.id, formData);
      await onSuccess(updated, { reussi });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemande = async () => {
    setError('');
    if (!datePassation) {
      setError('Indiquez la date de passation');
      return;
    }
    if (!demandeGrade) {
      setError('Aucune ceinture noire supérieure disponible');
      return;
    }
    setLoading(true);
    try {
      const request = await requestBlackBeltPassation({
        judoka_id: judoka.id,
        grade_to: demandeGrade,
        date_passation: datePassation,
        note: note.trim(),
      });
      await onRequestSent?.(request, { grade_to: demandeGrade });
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="grade-passation-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="grade-passation-title">
        <header className="grade-passation-head">
          <div>
            <p className="grade-passation-kicker">Grade</p>
            <h3 id="grade-passation-title">Passation de grade</h3>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={loading}>
            Fermer
          </button>
        </header>

        <div className="grade-passation-summary">
          <div>
            <span>Athlète</span>
            <strong>{judoka.prenom} {judoka.nom}</strong>
          </div>
          <div>
            <span>Grade actuel</span>
            <strong>{judoka.grade || '-'}</strong>
          </div>
          {judoka.club ? (
            <div>
              <span>Club</span>
              <strong>{judoka.club}</strong>
            </div>
          ) : null}
        </div>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="grade-passation-form">
          <div className="form-group">
            <label htmlFor="passation-date">Date de passation *</label>
            <input
              id="passation-date"
              type="date"
              value={datePassation}
              onChange={(e) => setDatePassation(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Résultat</label>
            <div className="grade-passation-result">
              <label className={`grade-passation-choice ${reussi ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="passation-result"
                  checked={reussi}
                  onChange={() => setReussi(true)}
                />
                <span>
                  <strong>Passe en grade</strong>
                  <small>Ceinture supérieure</small>
                </span>
              </label>
              <label className={`grade-passation-choice ${!reussi ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="passation-result"
                  checked={!reussi}
                  onChange={() => setReussi(false)}
                />
                <span>
                  <strong>Ne passe pas</strong>
                  <small>Reste au grade actuel</small>
                </span>
              </label>
            </div>
          </div>

          {reussi && (
            <div className="form-group">
              <label htmlFor="passation-grade">Ceinture supérieure *</label>
              <select
                id="passation-grade"
                className="grade-passation-select"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
              >
                {allowedGrades.map((g) => {
                  const disabled = isLowerOrEqualGrade(g);
                  return (
                    <option
                      key={g}
                      value={g}
                      disabled={disabled}
                      className={disabled ? 'grade-option-disabled' : ''}
                    >
                      {disabled ? `${g} (indisponible)` : g}
                    </option>
                  );
                })}
              </select>
              <p className="form-hint">Les ceintures inférieures ou égales au grade actuel sont inactives.</p>
            </div>
          )}

          {needsBlackExtras && (
            <div className="grade-passation-black-block">
              <p className="grade-passation-black-label">Examen ceinture noire</p>
              <div className="form-group">
                <label htmlFor="passation-instructeur">Instructeur *</label>
                <select
                  id="passation-instructeur"
                  value={instructeurId}
                  onChange={(e) => setInstructeurId(e.target.value)}
                  required
                >
                  <option value="">- Sélectionner -</option>
                  {entraineurs.map((en) => (
                    <option key={en.id} value={en.id}>
                      {`${en.prenom || ''} ${en.nom || ''}`.trim() || en.email || en.id}
                      {en.club ? ` · ${en.club}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="passation-points">Points</label>
                <input
                  id="passation-points"
                  type="number"
                  min="0"
                  step="0.1"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="Ex. 75"
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="passation-note">Note / observation</label>
            <textarea id="passation-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="grade-passation-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            {showDemande && (
              <button
                type="button"
                className="btn btn-demande-grade"
                onClick={handleDemande}
                disabled={loading}
                title={`Demander ${demandeGrade} au Responsable Grade`}
              >
                {loading ? 'Envoi...' : 'Demande'}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
