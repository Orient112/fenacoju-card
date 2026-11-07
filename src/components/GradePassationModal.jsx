import { useMemo, useState } from 'react';
import { GRADES, GRADES_CLUB, isBlackBeltGrade, updateJudoka } from '../api';

export default function GradePassationModal({
  judoka,
  onClose,
  onSuccess,
  mode = 'full', // full | club | black
  entraineurs = [],
}) {
  const allowedGrades = useMemo(() => {
    if (mode === 'club') return GRADES_CLUB;
    if (mode === 'black') return GRADES.filter((g) => isBlackBeltGrade(g));
    return GRADES;
  }, [mode]);

  const nextSuggested = useMemo(() => {
    const idx = allowedGrades.indexOf(judoka.grade);
    if (idx >= 0 && idx < allowedGrades.length - 1) return allowedGrades[idx + 1];
    return allowedGrades.find((g) => g !== judoka.grade) || allowedGrades[0] || judoka.grade || 'Blanche';
  }, [allowedGrades, judoka.grade]);

  const [reussi, setReussi] = useState(true);
  const [grade, setGrade] = useState(
    allowedGrades.includes(nextSuggested) ? nextSuggested : (allowedGrades[0] || judoka.grade || 'Blanche')
  );
  const [instructeurId, setInstructeurId] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const targetGrade = reussi ? grade : (judoka.grade || '');
  const needsBlackExtras = reussi && (mode === 'black' || isBlackBeltGrade(targetGrade));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (reussi) {
      if (!grade || grade === judoka.grade) {
        setError('Choisissez une ceinture supérieure différente du grade actuel');
        return;
      }
      if (mode === 'club' && isBlackBeltGrade(grade)) {
        setError('Les Clubs ne peuvent attribuer que Blanche à Marron');
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
      <div className="grade-passation-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Passation de grade</h3>
        <p>
          Enregistrer la passation de <strong>{judoka.prenom} {judoka.nom}</strong>
          {judoka.club ? <> · {judoka.club}</> : null}.
        </p>
        <p className="grade-passation-current">
          Grade actuel <span>{judoka.grade || '-'}</span>
        </p>
        {mode === 'club' && (
          <p className="form-hint">Passation Club : ceintures Blanche à Marron uniquement.</p>
        )}
        {mode === 'black' && (
          <p className="form-hint">Ceinture noire : désignation d&apos;un instructeur et points d&apos;examen.</p>
        )}

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Résultat de la passation</label>
            <div className="grade-passation-result">
              <label className={`grade-passation-choice ${reussi ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="passation-result"
                  checked={reussi}
                  onChange={() => setReussi(true)}
                />
                Passe en grade (ceinture supérieure)
              </label>
              <label className={`grade-passation-choice ${!reussi ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="passation-result"
                  checked={!reussi}
                  onChange={() => setReussi(false)}
                />
                Ne passe pas (reste au grade actuel)
              </label>
            </div>
          </div>

          {reussi && (
            <div className="form-group">
              <label htmlFor="passation-grade">Ceinture supérieure</label>
              <select id="passation-grade" value={grade} onChange={(e) => setGrade(e.target.value)} required>
                {allowedGrades.map((g) => (
                  <option key={g} value={g} disabled={g === judoka.grade}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {needsBlackExtras && (
            <>
              <div className="form-group">
                <label htmlFor="passation-instructeur">Instructeur (examen) *</label>
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
            </>
          )}

          <div className="form-group">
            <label htmlFor="passation-note">Note / observation</label>
            <textarea id="passation-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="confirm-actions">
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
