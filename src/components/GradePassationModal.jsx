import { useState } from 'react';
import { GRADES, updateJudoka } from '../api';

export default function GradePassationModal({ judoka, onClose, onSuccess }) {
  const [grade, setGrade] = useState(judoka.grade || 'Blanche');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!grade || grade === judoka.grade) {
      setError('Choisissez un grade différent du grade actuel');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('grade', grade);
      const updated = await updateJudoka(judoka.id, formData);
      await onSuccess(updated);
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
          Valider le nouveau grade de <strong>{judoka.prenom} {judoka.nom}</strong>
          {judoka.club ? <> · {judoka.club}</> : null}.
          La fiche du judoka sera mise à jour immédiatement.
        </p>
        <p className="grade-passation-current">
          Grade actuel <span>{judoka.grade || '—'}</span>
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="passation-grade">Nouveau grade</label>
            <select id="passation-grade" value={grade} onChange={(e) => setGrade(e.target.value)} required>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="confirm-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Validation...' : 'Valider le grade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
