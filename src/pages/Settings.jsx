import { useMemo, useRef, useState } from 'react';
import {
  updateAccountProfile,
  changeAccountPassword,
  uploadAccountPhoto,
  deleteAccountPhoto,
  resolveMediaUrl,
  USER_TYPES,
} from '../api';

function roleLabel(user) {
  if (!user) return '';
  if (user.type === 'admin') return 'Administrateur';
  if (user.type === 'federation') return user.fonction || 'Fédération';
  return USER_TYPES[user.type]?.label || user.type;
}

function accountDisplayName(user) {
  if (!user) return '';
  if (user.type === 'admin') return 'Administrateur';
  if (user.type === 'club') return user.nom_club || '';
  if (user.type === 'ligue' || user.type === 'entente') {
    return user.nom_organisation || user.nom || '';
  }
  return `${user.prenom || ''} ${user.nom || ''}`.trim();
}

export default function Settings({ user, onUserUpdated }) {
  const fileInputRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [telephone, setTelephone] = useState(user?.telephone || '');
  const [nom, setNom] = useState(user?.nom || '');
  const [prenom, setPrenom] = useState(user?.prenom || '');
  const [ville, setVille] = useState(user?.ville || '');
  const [responsable, setResponsable] = useState(user?.responsable || '');
  const [grade, setGrade] = useState(user?.grade || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showPersonNames = ['admin', 'federation', 'membre', 'entraineur'].includes(user?.type);
  const showOrgFields = ['ligue', 'entente', 'club'].includes(user?.type);
  const showGrade = user?.type === 'entraineur';
  const displayName = accountDisplayName(user) || 'Mon compte';

  const initials = useMemo(() => {
    const name = displayName || 'U';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }, [displayName]);

  const applyUser = (next) => {
    onUserUpdated?.(next);
    setTelephone(next.telephone || '');
    setNom(next.nom || '');
    setPrenom(next.prenom || '');
    setVille(next.ville || '');
    setResponsable(next.responsable || '');
    setGrade(next.grade || '');
  };

  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    setPhotoBusy(true);
    try {
      const updated = await uploadAccountPhoto(file);
      applyUser(updated);
      setSuccess('Photo de profil mise à jour.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setError('');
    setSuccess('');
    setPhotoBusy(true);
    try {
      const updated = await deleteAccountPhoto();
      applyUser(updated);
      setSuccess('Photo de profil supprimée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setProfileBusy(true);
    try {
      const payload = { telephone };
      if (showPersonNames) {
        payload.nom = nom;
        payload.prenom = prenom;
      }
      if (showOrgFields) {
        payload.ville = ville;
        payload.responsable = responsable;
      }
      if (showGrade) payload.grade = grade;
      const updated = await updateAccountProfile(payload);
      applyUser(updated);
      setSuccess('Informations du compte enregistrées.');
    } catch (err) {
      setError(err.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setPasswordBusy(true);
    try {
      const updated = await changeAccountPassword(currentPassword, newPassword);
      applyUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Mot de passe modifié.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <section className="settings-stage">
        <div className="settings-stage-glow" aria-hidden="true" />
        <div className="settings-stage-grid" aria-hidden="true" />
        <div className="settings-stage-inner">
          <p className="settings-brand">FENACOJU</p>
          <h2 className="settings-title">Réglages</h2>
          <p className="settings-lead">Gérez votre profil, vos coordonnées et la sécurité de votre compte.</p>

          <div className="settings-profile-block">
            <div className={`settings-avatar-ring ${user?.photo ? 'has-photo' : ''}`}>
              {user?.photo ? (
                <img
                  src={resolveMediaUrl(user.photo)}
                  alt=""
                  className="settings-avatar-img"
                />
              ) : (
                <span className="settings-avatar-fallback" aria-hidden="true">{initials}</span>
              )}
            </div>
            <div className="settings-profile-copy">
              <h3 className="settings-profile-name">{displayName}</h3>
              <p className="settings-profile-role">{roleLabel(user)}</p>
              <div className="settings-photo-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={handlePhotoSelected}
                />
                <button
                  type="button"
                  className="btn settings-btn-gold"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoBusy}
                >
                  {photoBusy ? 'Chargement...' : 'Charger une photo'}
                </button>
                {user?.photo && (
                  <button
                    type="button"
                    className="btn settings-btn-ghost"
                    onClick={handlePhotoRemove}
                    disabled={photoBusy}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(error || success) && (
        <div className="settings-alerts">
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
        </div>
      )}

      <div className="settings-panels">
        <section className="settings-panel settings-panel-identity">
          <header className="settings-panel-head">
            <h3>Identité</h3>
            <p>Mettez à jour les informations visibles sur votre compte.</p>
          </header>
          <form className="settings-form" onSubmit={handleProfileSave}>
            <div className="form-group">
              <label>Identifiant / e-mail</label>
              <input type="text" value={user?.email || user?.username || ''} readOnly disabled />
            </div>
            <div className="form-group">
              <label htmlFor="settings-telephone">Téléphone</label>
              <input
                id="settings-telephone"
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="Ex. 0990000000"
              />
            </div>
            {showPersonNames && (
              <div className="settings-form-grid">
                <div className="form-group">
                  <label htmlFor="settings-prenom">Prénom</label>
                  <input
                    id="settings-prenom"
                    type="text"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="settings-nom">Nom</label>
                  <input
                    id="settings-nom"
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                  />
                </div>
              </div>
            )}
            {showOrgFields && (
              <div className="settings-form-grid">
                <div className="form-group">
                  <label htmlFor="settings-ville">Ville</label>
                  <input
                    id="settings-ville"
                    type="text"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="settings-responsable">Responsable</label>
                  <input
                    id="settings-responsable"
                    type="text"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                  />
                </div>
              </div>
            )}
            {showGrade && (
              <div className="form-group">
                <label htmlFor="settings-grade">Grade</label>
                <input
                  id="settings-grade"
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                />
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={profileBusy}>
                {profileBusy ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-panel settings-panel-security">
          <header className="settings-panel-head">
            <h3>Sécurité</h3>
            <p>Changez votre mot de passe pour protéger l’accès à votre compte.</p>
          </header>
          <form className="settings-form" onSubmit={handlePasswordSave}>
            <div className="form-group">
              <label htmlFor="settings-current-password">Mot de passe actuel</label>
              <input
                id="settings-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="settings-form-grid">
              <div className="form-group">
                <label htmlFor="settings-new-password">Nouveau mot de passe</label>
                <input
                  id="settings-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="settings-confirm-password">Confirmer</label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
                {passwordBusy ? 'Modification...' : 'Modifier le mot de passe'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
