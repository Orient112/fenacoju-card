import { useState, useEffect } from 'react';
import { createArbitre, updateArbitre, ARBITRE_NIVEAUX, GRADES } from '../api';

const empty = {
  nom: '',
  prenom: '',
  niveau: 'National',
  club: '',
  grade: '',
  telephone: '',
  email: '',
};

export default function ArbitreForm({ arbitre, registeredClubs = [], onSubmit, onCancel }) {
  const isEdit = !!arbitre;
  const [form, setForm] = useState(() => ({
    ...empty,
    ...(arbitre || {}),
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ ...empty, ...(arbitre || {}) });
    setError('');
  }, [arbitre]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        niveau: form.niveau,
        club: form.club?.trim() || '',
        grade: form.grade || '',
        telephone: form.telephone?.trim() || '',
        email: form.email?.trim() || '',
      };
      const saved = isEdit
        ? await updateArbitre(arbitre.id, payload)
        : await createArbitre(payload);
      await onSubmit(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-card">
      <h2>{isEdit ? 'Modifier - Arbitre' : 'Nouveau - Arbitre'}</h2>
      <p className="subtitle">
        {isEdit
          ? 'Modifiez la fiche arbitre'
          : 'Fiche arbitre simple — sans identifiant ni mot de passe'}
      </p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Nom <span className="required">*</span></label>
            <input name="nom" value={form.nom} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Prénom <span className="required">*</span></label>
            <input name="prenom" value={form.prenom} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Niveau <span className="required">*</span></label>
            <select name="niveau" value={form.niveau} onChange={handleChange} required>
              {ARBITRE_NIVEAUX.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Club</label>
            {registeredClubs.length > 0 ? (
              <select name="club" value={form.club} onChange={handleChange}>
                <option value="">— Optionnel —</option>
                {registeredClubs.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <input name="club" value={form.club} onChange={handleChange} placeholder="Club (optionnel)" />
            )}
          </div>
          <div className="form-group">
            <label>Grade</label>
            <select name="grade" value={form.grade} onChange={handleChange}>
              <option value="">— Optionnel —</option>
              {GRADES.filter((g) => g.startsWith('Noire')).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Téléphone</label>
            <input name="telephone" value={form.telephone} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Email (contact)</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
