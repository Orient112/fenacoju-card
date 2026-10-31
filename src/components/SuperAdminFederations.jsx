import { useEffect, useState } from 'react';
import { createFederation, fetchFederations } from '../api';

export default function SuperAdminFederations({ onToast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nom_federation: '',
    email: '',
    password: '',
    nom: 'Administrateur',
    prenom: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchFederations();
      setList(data.federations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await createFederation(form);
      onToast?.(`Fédération créée : ${result.federation?.nom}`);
      setShowForm(false);
      setForm({
        nom_federation: '',
        email: '',
        password: '',
        nom: 'Administrateur',
        prenom: '',
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="superadmin-panel">
      <div className="list-toolbar">
        <div>
          <h2>Fédérations</h2>
          <p className="form-hint">
            Chaque compte Admin = une fédération isolée (copie du système, sans données partagées).
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          Nouvelle fédération
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="page-loader"><div className="spinner" /><p>Chargement…</p></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <h3>Aucune fédération</h3>
          <p>Créez un compte Admin pour démarrer une nouvelle fédération.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Fédération</th>
              <th>Admin (identifiant)</th>
              <th>Créée le</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td data-label="Fédération">
                  <strong>{f.nom}</strong>
                  {f.slug ? <div className="judoka-club">{f.slug}</div> : null}
                </td>
                <td data-label="Admin">
                  {f.admin?.email || f.admin?.username || '—'}
                  {f.admin ? (
                    <div className="judoka-club">{f.admin.prenom || ''} {f.admin.nom || ''}</div>
                  ) : null}
                </td>
                <td data-label="Créée le">
                  {f.created_at ? new Date(f.created_at).toLocaleString('fr-FR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="confirm-overlay" onClick={() => !busy && setShowForm(false)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Nouvelle fédération</h3>
                <p className="form-hint">Crée le compte Admin et un espace vide isolé.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowForm(false)} disabled={busy}>
                Fermer
              </button>
            </header>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nom de la fédération *</label>
                <input
                  value={form.nom_federation}
                  onChange={(e) => setForm((p) => ({ ...p, nom_federation: e.target.value }))}
                  required
                  placeholder="Ex. Fédération de Karaté"
                />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nom Admin</label>
                  <input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Prénom Admin</label>
                  <input value={form.prenom} onChange={(e) => setForm((p) => ({ ...p, prenom: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Identifiant / Email Admin *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  required
                  placeholder="admin@exemple.com"
                />
              </div>
              <div className="form-group">
                <label>Mot de passe Admin *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} disabled={busy}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Création…' : 'Créer la fédération'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
