import { useEffect, useRef, useState } from 'react';
import {
  createFederation,
  deleteFederation,
  deleteFederationLogo,
  fetchFederations,
  resolveMediaUrl,
  updateFederation,
  uploadFederationLogo,
} from '../api';
import { IconEdit, IconTrash } from './ActionIcons';

const EMPTY_FORM = {
  nom_federation: '',
  email: '',
  password: '',
  nom: 'Administrateur',
  prenom: '',
};

export default function SuperAdminFederations({ onToast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ nom: '', admin_password: '' });
  const logoInputRef = useRef(null);
  const [logoTargetId, setLogoTargetId] = useState(null);

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
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (f) => {
    setEditTarget(f);
    setEditForm({ nom: f.nom || '', admin_password: '' });
    setError('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setBusy(true);
    setError('');
    try {
      const payload = { nom: editForm.nom };
      if (editForm.admin_password) payload.admin_password = editForm.admin_password;
      await updateFederation(editTarget.id, payload);
      onToast?.('Fédération mise à jour');
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      await deleteFederation(deleteTarget.id);
      onToast?.(`Fédération supprimée : ${deleteTarget.nom}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (federationId) => {
    setLogoTargetId(federationId);
    logoInputRef.current?.click();
  };

  const onLogoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !logoTargetId) return;
    setBusy(true);
    setError('');
    try {
      await uploadFederationLogo(logoTargetId, file);
      onToast?.('Logo mis à jour');
      await load();
      if (editTarget?.id === logoTargetId) {
        const data = await fetchFederations();
        const refreshed = (data.federations || []).find((f) => f.id === logoTargetId);
        if (refreshed) setEditTarget(refreshed);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setLogoTargetId(null);
    }
  };

  const removeLogo = async (federationId) => {
    setBusy(true);
    setError('');
    try {
      await deleteFederationLogo(federationId);
      onToast?.('Logo retiré');
      await load();
      if (editTarget?.id === federationId) {
        setEditTarget((prev) => (prev ? { ...prev, logo_url: '' } : prev));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="superadmin-panel">
      <input
        ref={logoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={onLogoSelected}
      />

      <div className="list-toolbar">
        <div>
          <h2>Fédérations</h2>
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
              <th>Logo</th>
              <th>Fédération</th>
              <th>Admin (identifiant)</th>
              <th>Créée le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td data-label="Logo">
                  <button
                    type="button"
                    className="superadmin-logo-btn"
                    onClick={() => pickLogo(f.id)}
                    title="Changer le logo"
                    disabled={busy}
                  >
                    <img
                      src={f.logo_url ? resolveMediaUrl(f.logo_url) : '/fenacoju-logo.png'}
                      alt=""
                      className="superadmin-fed-logo"
                    />
                  </button>
                </td>
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
                <td data-label="Actions">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => openEdit(f)}
                      title="Modifier / paramétrer"
                      disabled={busy}
                    >
                      <IconEdit />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setDeleteTarget(f)}
                      title="Supprimer"
                      disabled={busy}
                    >
                      <IconTrash />
                      <span>Supprimer</span>
                    </button>
                  </div>
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
                <p className="form-hint">Crée le compte Admin et un espace dédié.</p>
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

      {editTarget && (
        <div className="confirm-overlay" onClick={() => !busy && setEditTarget(null)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Paramétrage</h3>
                <p className="form-hint">{editTarget.nom}</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditTarget(null)} disabled={busy}>
                Fermer
              </button>
            </header>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Logo</label>
                <div className="superadmin-logo-edit">
                  <img
                    src={editTarget.logo_url ? resolveMediaUrl(editTarget.logo_url) : '/fenacoju-logo.png'}
                    alt=""
                    className="superadmin-fed-logo lg"
                  />
                  <div className="confirm-actions" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => pickLogo(editTarget.id)} disabled={busy}>
                      Changer le logo
                    </button>
                    {editTarget.logo_url ? (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => removeLogo(editTarget.id)} disabled={busy}>
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Nom de la fédération *</label>
                <input
                  value={editForm.nom}
                  onChange={(e) => setEditForm((p) => ({ ...p, nom: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Nouvel mot de passe Admin (optionnel)</label>
                <input
                  type="password"
                  value={editForm.admin_password}
                  onChange={(e) => setEditForm((p) => ({ ...p, admin_password: e.target.value }))}
                  minLength={6}
                  placeholder="Laisser vide pour ne pas changer"
                />
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditTarget(null)} disabled={busy}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => !busy && setDeleteTarget(null)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Supprimer la fédération</h3>
                <p className="form-hint">
                  Confirmez la suppression de « {deleteTarget.nom} ». Le compte Admin associé sera également retiré.
                </p>
              </div>
            </header>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
