import { useMemo, useState } from 'react';
import { GRADES, GRADES_CLUB, isBlackBeltGrade, updateJudoka } from '../api';

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
  mode = 'full', // full | club | black
  entraineurs = [],
  allowBlackBelts = false,
}) {
  const canUseBlack = allowBlackBelts || mode === 'full' || mode === 'black';

  const allowedGrades = useMemo(() => {
    if (mode === 'black') return GRADES.filter((g) => isBlackBeltGrade(g));
    if (canUseBlack) return GRADES;
    return GRADES_CLUB;
  }, [mode, canUseBlack]);

  const nextSuggested = useMemo(() => {
    const idx = allowedGrades.indexOf(judoka.grade);
    if (idx >= 0 && idx < allowedGrades.length - 1) return allowedGrades[idx + 1];
    return allowedGrades.find((g) => g !== judoka.grade) || allowedGrades[0] || judoka.grade || 'Blanche';
  }, [allowedGrades, judoka.grade]);

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
  const needsBlackExtras = reussi && isBlackBeltGrade(targetGrade);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!datePassation) {
      setError('Indiquez la date de passation');
      return;
    }
    if (reussi) {
      if (!grade || grade === judoka.grade) {
        setError('Choisissez une ceinture supérieure différente du grade actuel');
        return;
      }
      if (!canUseBlack && isBlackBeltGrade(grade)) {
        setError('La passation ceinture noire est gérée par la fédération');
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
              <select id="passation-grade" value={grade} onChange={(e) => setGrade(e.target.value)} required>
                {allowedGrades.map((g) => (
                  <option key={g} value={g} disabled={g === judoka.grade}>{g}</option>
                ))}
              </select>
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
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
