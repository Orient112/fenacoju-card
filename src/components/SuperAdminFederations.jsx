import { useEffect, useRef, useState } from 'react';
import {
  createFederation,
  deleteFederation,
  deleteFederationLogo,
  deleteFederationPaymentAccount,
  fetchFederationPaymentAccounts,
  fetchFederations,
  resetFederationAdminPassword,
  resolveMediaUrl,
  saveFederationPaymentAccount,
  toggleFederationActive,
  updateFederation,
  uploadFederationLogo,
} from '../api';
import { IconEdit, IconKey, IconPayment, IconPower, IconTrash } from './ActionIcons';
import BrandLoader from './BrandLoader';

function isFedActive(f) {
  return f?.actif !== false;
}

const EMPTY_FORM = {
  nom_federation: '',
  nom_profil: '',
  email: '',
  password: '',
  nom: '',
  prenom: '',
};

function PasswordField({ id, value, onChange, required = false, placeholder = '', minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((v) => !v)}
        title={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function SuperAdminFederations({ onToast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ nom: '', nom_profil: '' });
  const [createLogoFile, setCreateLogoFile] = useState(null);
  const [createLogoPreview, setCreateLogoPreview] = useState('');
  const logoInputRef = useRef(null);
  const createLogoRef = useRef(null);
  const [logoTargetId, setLogoTargetId] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentEdit, setPaymentEdit] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ merchant_code: '', api_key: '' });

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

  useEffect(() => () => {
    if (createLogoPreview) URL.revokeObjectURL(createLogoPreview);
  }, [createLogoPreview]);

  const closeCreateForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setCreateLogoFile(null);
    if (createLogoPreview) URL.revokeObjectURL(createLogoPreview);
    setCreateLogoPreview('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await createFederation(form);
      let federation = result.federation;
      if (createLogoFile && federation?.id) {
        federation = await uploadFederationLogo(federation.id, createLogoFile);
      }
      onToast?.(`Fédération créée : ${federation?.nom || result.federation?.nom}`);
      closeCreateForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (f) => {
    setEditTarget(f);
    setEditForm({
      nom: f.nom || '',
      nom_profil: String(f.nom_profil || f.nom || '').trim(),
    });
    setError('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setBusy(true);
    setError('');
    try {
      await updateFederation(editTarget.id, {
        nom: editForm.nom,
        nom_profil: editForm.nom_profil,
      });
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    setError('');
    try {
      await resetFederationAdminPassword(resetTarget.id, resetPassword);
      onToast?.(`Mot de passe Admin réinitialisé pour ${resetTarget.nom}`);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (f) => {
    const currentlyActive = isFedActive(f);
    const next = !currentlyActive;
    const confirmMsg = next
      ? `Réactiver la fédération « ${f.nom} » ? Les comptes pourront à nouveau se connecter.`
      : `Désactiver la fédération « ${f.nom} » ? Tous les comptes attachés ne pourront plus se connecter. Les données sont conservées.`;
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setError('');
    try {
      await toggleFederationActive(f.id, next);
      onToast?.(next
        ? `Fédération activée : ${f.nom}`
        : `Fédération désactivée : ${f.nom}`);
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

  const onCreateLogoSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (createLogoPreview) URL.revokeObjectURL(createLogoPreview);
    setCreateLogoFile(file);
    setCreateLogoPreview(URL.createObjectURL(file));
  };

  const openPaymentModal = async (f) => {
    setPaymentTarget(f);
    setPaymentAccounts([]);
    setPaymentEdit(null);
    setPaymentForm({ merchant_code: '', api_key: '' });
    setPaymentLoading(true);
    setError('');
    try {
      const data = await fetchFederationPaymentAccounts(f.id);
      setPaymentAccounts(data.accounts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const closePaymentModal = () => {
    if (busy) return;
    setPaymentTarget(null);
    setPaymentAccounts([]);
    setPaymentEdit(null);
    setPaymentForm({ merchant_code: '', api_key: '' });
  };

  const openPaymentEdit = (account) => {
    setPaymentEdit(account);
    setPaymentForm({
      merchant_code: account.payment_merchant_code || '',
      api_key: '',
    });
    setError('');
  };

  const reloadPaymentAccounts = async (federationId) => {
    const data = await fetchFederationPaymentAccounts(federationId);
    setPaymentAccounts(data.accounts || []);
  };

  const handlePaymentSave = async (e) => {
    e.preventDefault();
    if (!paymentTarget || !paymentEdit) return;
    const merchant = String(paymentForm.merchant_code || '').trim();
    const apiKey = String(paymentForm.api_key || '').trim();
    if (!merchant) {
      setError('Le short code marchand est obligatoire');
      return;
    }
    if (!paymentEdit.payment_api_key_set && !apiKey) {
      setError('La clé API est obligatoire');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = { payment_merchant_code: merchant };
      if (apiKey) payload.payment_api_key = apiKey;
      await saveFederationPaymentAccount(paymentTarget.id, paymentEdit.id, payload);
      onToast?.(`Identifiants paiement enregistrés pour ${paymentEdit.nom}`);
      setPaymentEdit(null);
      setPaymentForm({ merchant_code: '', api_key: '' });
      await reloadPaymentAccounts(paymentTarget.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentClear = async (account) => {
    if (!paymentTarget || !account) return;
    if (!window.confirm(`Supprimer le short code et la clé API de « ${account.nom} » ?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteFederationPaymentAccount(paymentTarget.id, account.id);
      onToast?.(`Identifiants paiement retirés pour ${account.nom}`);
      if (paymentEdit?.id === account.id) {
        setPaymentEdit(null);
        setPaymentForm({ merchant_code: '', api_key: '' });
      }
      await reloadPaymentAccounts(paymentTarget.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accountTypeLabel = (account) => {
    if (account?.type === 'entente') return 'Entente';
    if (account?.fonction) return account.fonction;
    return 'Directeur Compétition';
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
      <input
        ref={createLogoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={onCreateLogoSelected}
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
        <BrandLoader label="Chargement…" />
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
                  {f.nom_profil ? <div className="judoka-club">{f.nom_profil}</div> : null}
                  {f.slug ? <div className="judoka-club">{f.slug}</div> : null}
                  <div className={`fed-status-chip ${isFedActive(f) ? 'is-on' : 'is-off'}`}>
                    {isFedActive(f) ? 'Activée' : 'Désactivée'}
                  </div>
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
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => openEdit(f)}
                      title="Modifier"
                      aria-label="Modifier"
                      disabled={busy}
                    >
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => {
                        setResetTarget(f);
                        setResetPassword('');
                        setError('');
                      }}
                      title="Réinitialiser le mot de passe Admin"
                      aria-label="Réinitialiser le mot de passe Admin"
                      disabled={busy}
                    >
                      <IconKey />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => setDeleteTarget(f)}
                      title="Supprimer"
                      aria-label="Supprimer"
                      disabled={busy}
                    >
                      <IconTrash />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => openPaymentModal(f)}
                      title="Paiement"
                      aria-label="Paiement"
                      disabled={busy}
                    >
                      <IconPayment />
                    </button>
                    <button
                      type="button"
                      className={`btn btn-icon btn-sm fed-toggle-btn ${isFedActive(f) ? 'is-on' : 'is-off'}`}
                      onClick={() => handleToggleActive(f)}
                      title={isFedActive(f) ? 'Désactiver' : 'Activer'}
                      aria-label={isFedActive(f) ? 'Désactiver' : 'Activer'}
                      disabled={busy}
                    >
                      <IconPower />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="confirm-overlay sa-fed-overlay" onClick={() => !busy && closeCreateForm()}>
          <div className="sa-fed-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="sa-fed-modal-title">
            <div className="sa-fed-modal-banner">
              <div>
                <p className="sa-kicker">Nouveau tenant</p>
                <h3 id="sa-fed-modal-title">Nouvelle fédération</h3>
              </div>
              <button type="button" className="sa-fed-modal-close" onClick={closeCreateForm} disabled={busy} aria-label="Fermer">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="sa-fed-modal-body">
              <fieldset className="sa-fed-fieldset">
                <legend>Fédération</legend>
                <div className="form-group">
                  <label>Nom de la fédération *</label>
                  <input
                    value={form.nom_federation}
                    onChange={(e) => setForm((p) => ({ ...p, nom_federation: e.target.value }))}
                    required
                    placeholder="Ex. Fédération de Karaté"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Nom Profil *</label>
                  <input
                    value={form.nom_profil}
                    onChange={(e) => setForm((p) => ({ ...p, nom_profil: e.target.value }))}
                    required
                    placeholder="Affiché dans la bande des menus"
                  />
                </div>
                <div className="form-group">
                  <label>Logo</label>
                  <div className="superadmin-logo-edit">
                    <button
                      type="button"
                      className={`sa-logo-dropzone ${createLogoPreview ? 'has-preview' : ''}`}
                      onClick={() => createLogoRef.current?.click()}
                      disabled={busy}
                    >
                      {createLogoPreview ? (
                        <img src={createLogoPreview} alt="" />
                      ) : (
                        <span>Charger un logo</span>
                      )}
                    </button>
                    {createLogoFile ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          if (createLogoPreview) URL.revokeObjectURL(createLogoPreview);
                          setCreateLogoFile(null);
                          setCreateLogoPreview('');
                        }}
                        disabled={busy}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </div>
              </fieldset>
              <fieldset className="sa-fed-fieldset">
                <legend>Compte Admin</legend>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nom</label>
                    <input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Prénom</label>
                    <input value={form.prenom} onChange={(e) => setForm((p) => ({ ...p, prenom: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Identifiant / Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    required
                    placeholder="admin@exemple.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="sa-fed-password">Mot de passe *</label>
                  <PasswordField
                    id="sa-fed-password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    required
                    minLength={6}
                    placeholder="Minimum 6 caractères"
                  />
                </div>
              </fieldset>
              <div className="sa-fed-modal-actions">
                <button type="button" className="btn btn-outline" onClick={closeCreateForm} disabled={busy}>
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
        <div className="confirm-overlay sa-fed-overlay" onClick={() => !busy && setEditTarget(null)}>
          <div className="sa-fed-modal sa-fed-modal-edit" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="sa-edit-modal-title">
            <div className="sa-fed-modal-banner sa-fed-modal-banner-edit">
              <div>
                <p className="sa-kicker">Fédération</p>
                <h3 id="sa-edit-modal-title">Paramétrage</h3>
              </div>
              <button type="button" className="sa-fed-modal-close" onClick={() => setEditTarget(null)} disabled={busy} aria-label="Fermer">
                ×
              </button>
            </div>
            <form onSubmit={handleEdit} className="sa-fed-modal-body">
              <fieldset className="sa-fed-fieldset">
                <legend>Identité</legend>
                <div className="form-group">
                  <label>Logo</label>
                  <div className="superadmin-logo-edit">
                    <button
                      type="button"
                      className={`sa-logo-dropzone has-preview`}
                      onClick={() => pickLogo(editTarget.id)}
                      disabled={busy}
                    >
                      <img
                        src={editTarget.logo_url ? resolveMediaUrl(editTarget.logo_url) : '/fenacoju-logo.png'}
                        alt=""
                      />
                    </button>
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
                  <label>Nom Profil *</label>
                  <input
                    value={editForm.nom_profil}
                    onChange={(e) => setEditForm((p) => ({ ...p, nom_profil: e.target.value }))}
                    required
                    placeholder="Affiché dans la bande des menus"
                  />
                </div>
              </fieldset>
              <div className="sa-fed-modal-actions">
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

      {resetTarget && (
        <div className="confirm-overlay" onClick={() => !busy && setResetTarget(null)}>
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            <header className="competition-params-modal-head">
              <div>
                <h3>Réinitialiser le mot de passe</h3>
                <p className="form-hint">
                  Définissez un nouveau mot de passe pour l&apos;Admin de « {resetTarget.nom} » sans connaître l&apos;ancien.
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setResetTarget(null)} disabled={busy}>
                Fermer
              </button>
            </header>
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label htmlFor="sa-reset-password">Nouveau mot de passe *</label>
                <PasswordField
                  id="sa-reset-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 caractères"
                />
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setResetTarget(null)} disabled={busy}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Réinitialisation…' : 'Réinitialiser'}
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

      {paymentTarget && (
        <div className="confirm-overlay sa-fed-overlay" onClick={closePaymentModal}>
          <div
            className="sa-fed-modal sa-fed-modal-edit"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="sa-payment-modal-title"
          >
            <div className="sa-fed-modal-banner sa-fed-modal-banner-edit">
              <div>
                <p className="sa-kicker">SimplyPaye</p>
                <h3 id="sa-payment-modal-title">Paiement — {paymentTarget.nom}</h3>
              </div>
              <button type="button" className="sa-fed-modal-close" onClick={closePaymentModal} disabled={busy} aria-label="Fermer">
                ×
              </button>
            </div>
            <div className="sa-fed-modal-body">
              <p className="form-hint" style={{ marginTop: 0 }}>
                Short code marchand et clé API pour chaque compte qui gère une compétition.
                Les frais d&apos;inscription sont encaissés sur ce compte.
              </p>

              {paymentLoading ? (
                <BrandLoader label="Chargement…" />
              ) : paymentAccounts.length === 0 ? (
                <div className="empty-state">
                  <h3>Aucun compte compétition</h3>
                  <p>Créez un Directeur Compétition ou une Entente dans cette fédération.</p>
                </div>
              ) : (
                <div className="sa-payment-accounts">
                  {paymentAccounts.map((account) => (
                    <div key={account.id} className="sa-payment-account-row">
                      <div>
                        <strong>{account.nom}</strong>
                        <div className="judoka-club">
                          {accountTypeLabel(account)}
                          {account.org_code ? ` · ${account.org_code}` : ''}
                        </div>
                        <div className="judoka-club">
                          {account.payment_merchant_code
                            ? `Short code : ${account.payment_merchant_code}`
                            : 'Short code : —'}
                          {account.payment_api_key_set
                            ? ` · Clé API : ${account.payment_api_key_hint || '••••'}`
                            : ' · Clé API : —'}
                        </div>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-icon btn-sm"
                          onClick={() => openPaymentEdit(account)}
                          title={account.payment_merchant_code ? 'Modifier' : 'Ajouter'}
                          aria-label={account.payment_merchant_code ? 'Modifier' : 'Ajouter'}
                          disabled={busy}
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-icon btn-sm"
                          onClick={() => handlePaymentClear(account)}
                          title="Supprimer"
                          aria-label="Supprimer"
                          disabled={busy || (!account.payment_merchant_code && !account.payment_api_key_set)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paymentEdit && (
                <form onSubmit={handlePaymentSave} className="sa-payment-edit-form">
                  <fieldset className="sa-fed-fieldset">
                    <legend>{paymentEdit.payment_merchant_code ? 'Modifier' : 'Ajouter'} — {paymentEdit.nom}</legend>
                    <div className="form-group">
                      <label htmlFor="sa-pay-merchant">Short code marchand *</label>
                      <input
                        id="sa-pay-merchant"
                        value={paymentForm.merchant_code}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, merchant_code: e.target.value }))}
                        required
                        placeholder="Ex. 123456"
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="sa-pay-apikey">
                        Clé API {paymentEdit.payment_api_key_set ? '(laisser vide pour conserver)' : '*'}
                      </label>
                      <input
                        id="sa-pay-apikey"
                        type="password"
                        value={paymentForm.api_key}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, api_key: e.target.value }))}
                        required={!paymentEdit.payment_api_key_set}
                        placeholder={paymentEdit.payment_api_key_set ? '••••••••' : 'Clé API SimplyPaye'}
                        autoComplete="new-password"
                      />
                    </div>
                  </fieldset>
                  <div className="sa-fed-modal-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setPaymentEdit(null);
                        setPaymentForm({ merchant_code: '', api_key: '' });
                      }}
                      disabled={busy}
                    >
                      Annuler
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
