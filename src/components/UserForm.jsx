import { useState, useEffect } from 'react';
import { createUser, updateUser, uploadClubDocuments, GRADES, USER_TYPES, FEDERATION_ACCOUNT_FONCTIONS, getUserClub } from '../api';
import DocumentUploadField from './DocumentUploadField';

const CLUB_DOC_FIELDS = [
  { key: 'doc_affiliation', label: "Document d'affiliation" },
  { key: 'doc_statuts', label: 'Statuts du club' },
  { key: 'doc_agrement', label: 'Agrément / Autorisation' },
];

const emptyForms = {
  federation: { nom: '', prenom: '', email: '', telephone: '', fonction: '', password: '', confirmPassword: '' },
  membre: { nom: '', prenom: '', email: '', telephone: '', fonction: '' },
  ligue: { nom_organisation: '', ville: '', responsable: '', email: '', telephone: '', password: '', confirmPassword: '' },
  entente: { nom_organisation: '', ville: '', responsable: '', email: '', telephone: '', password: '', confirmPassword: '' },
  club: { nom_club: '', ville: '', responsable: '', email: '', telephone: '', password: '', confirmPassword: '' },
  entraineur: { nom: '', prenom: '', club: '', grade: 'Noire 1er Dan', email: '', telephone: '' },
};

function userToForm(user, type) {
  const base = { ...(emptyForms[type] || emptyForms.federation), password: '', confirmPassword: '' };
  if (!user) return base;
  return {
    ...base,
    nom: user.nom || '',
    prenom: user.prenom || '',
    email: user.email || '',
    telephone: user.telephone || '',
    fonction: user.fonction || '',
    nom_organisation: user.nom_organisation || user.nom || '',
    nom_club: user.nom_club || '',
    ville: user.ville || '',
    responsable: user.responsable || '',
    club: user.club || '',
    grade: user.grade || 'Noire 1er Dan',
  };
}

function emptyClubDocs() {
  return { doc_affiliation: null, doc_statuts: null, doc_agrement: null };
}

function emptyClubDocPreviews(user) {
  const docs = user?.documents || {};
  return {
    doc_affiliation: docs.doc_affiliation || null,
    doc_statuts: docs.doc_statuts || null,
    doc_agrement: docs.doc_agrement || null,
  };
}

const FORM_COPY = {
  club: {
    editTitle: 'Modifier - Club',
    newTitle: 'Nouveau - Club',
    editSubtitle: 'Modifiez les informations de ce Club',
    newSubtitle: 'Le compte sera actif après validation du Coordon',
  },
  entraineur: {
    editTitle: 'Modifier - Entraineur',
    newTitle: 'Nouveau - Entraineur',
    editSubtitle: "Modifiez les informations de l'Entraineur",
    newSubtitle: 'Enregistrez un nouvel Entraineur dans le système FENACOJU',
  },
  federation: {
    editTitle: 'Modifier - Compte Fédération',
    newTitle: 'Nouveau - Compte Fédération',
    editSubtitle: 'Modifiez les informations de ce compte',
    newSubtitle: 'Compte avec identifiant et mot de passe (ex. Coordon)',
    createLabel: 'Créer Compte',
  },
  membre: {
    editTitle: 'Modifier - Membre',
    newTitle: 'Nouveau - Membre de la Fédération',
    editSubtitle: 'Modifiez la fiche membre',
    newSubtitle: 'Fiche sans accès au système — indiquez le rôle fédéral',
    createLabel: 'Créer Membre',
  },
  ligue: {
    editTitle: 'Modifier - Ligue',
    newTitle: 'Nouveau - Ligue',
    editSubtitle: 'Modifiez les informations de cette Ligue',
    newSubtitle: 'Le compte Ligue sera actif après validation du Coordon',
  },
  entente: {
    editTitle: 'Modifier - Entente',
    newTitle: 'Nouveau - Entente',
    editSubtitle: 'Modifiez les informations de cette Entente',
    newSubtitle: 'Le compte Entente sera actif après validation du Coordon',
  },
};

function getFormTitle(type, isEdit) {
  const copy = FORM_COPY[type];
  if (copy) return isEdit ? copy.editTitle : copy.newTitle;
  const label = USER_TYPES[type]?.label || 'Utilisateur';
  return isEdit ? `Modifier - ${label}` : `Nouveau - ${label}`;
}

function getFormSubtitle(type, isEdit) {
  const copy = FORM_COPY[type];
  if (copy) return isEdit ? copy.editSubtitle : copy.newSubtitle;
  return isEdit
    ? 'Modifiez les informations de cet utilisateur'
    : 'Enregistrez un nouvel utilisateur dans le système FENACOJU';
}

function EmailField({ form, onChange }) {
  return (
    <div className="form-group">
      <label>Email / Identifiant <span className="required">*</span></label>
      <input
        name="email"
        value={form.email}
        onChange={onChange}
        required
        placeholder=""
        autoComplete="off"
      />
    </div>
  );
}

function TelephoneField({ form, onChange }) {
  return (
    <div className="form-group">
      <label>Téléphone</label>
      <input name="telephone" value={form.telephone} onChange={onChange} placeholder="+243 123456789" />
    </div>
  );
}

function OrgFields({ form, onChange, nameLabel }) {
  return (
    <>
      <div className="form-group">
        <label>{nameLabel} <span className="required">*</span></label>
        <input
          name="nom_organisation"
          value={form.nom_organisation}
          onChange={onChange}
          required
          placeholder={nameLabel}
        />
      </div>
      <div className="form-group">
        <label>Province / Ville</label>
        <input name="ville" value={form.ville} onChange={onChange} placeholder="" />
      </div>
      <div className="form-group">
        <label>Responsable</label>
        <input name="responsable" value={form.responsable} onChange={onChange} placeholder="Nom du responsable" />
      </div>
    </>
  );
}

export default function UserForm({ type, editingUser, currentUser, registeredClubs = [], onSubmit, onCancel }) {
  const isEdit = !!editingUser;
  const lockedClub = currentUser?.type === 'club' && type === 'entraineur' ? getUserClub(currentUser) : '';

  const [form, setForm] = useState(() => {
    const initial = userToForm(editingUser, type);
    if (lockedClub && !isEdit) initial.club = lockedClub;
    return initial;
  });
  const [clubDocs, setClubDocs] = useState(emptyClubDocs);
  const [clubDocPreviews, setClubDocPreviews] = useState(() => emptyClubDocPreviews(editingUser));
  const [activeCamera, setActiveCamera] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = userToForm(editingUser, type);
    if (lockedClub && !isEdit) initial.club = lockedClub;
    setForm(initial);
    setClubDocs(emptyClubDocs());
    setClubDocPreviews(emptyClubDocPreviews(editingUser));
    setActiveCamera(null);
    setError('');
  }, [editingUser, type, lockedClub, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setClubDocument = (key, file) => {
    setClubDocs((prev) => ({ ...prev, [key]: file }));
    setClubDocPreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const clearClubDocument = (key) => {
    setClubDocs((prev) => ({ ...prev, [key]: null }));
    setClubDocPreviews((prev) => ({ ...prev, [key]: null }));
  };

  const isNoLogin = type === 'entraineur' || type === 'membre';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isEdit && !isNoLogin) {
      if (form.password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        return;
      }
    } else if (!isNoLogin && form.password && form.password !== form.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      const { confirmPassword, ...data } = form;
      if (!data.password) delete data.password;

      let user;
      const hasNewDocs = type === 'club' && Object.values(clubDocs).some(Boolean);

      if (hasNewDocs && isEdit) {
        user = await updateUser(editingUser.id, data);
        user = await uploadClubDocuments(editingUser.id, clubDocs);
      } else if (hasNewDocs && !isEdit) {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => formData.append(key, value ?? ''));
        formData.append('type', type);
        Object.entries(clubDocs).forEach(([key, file]) => {
          if (file) formData.append(key, file);
        });
        user = await createUser(formData);
      } else {
        user = isEdit
          ? await updateUser(editingUser.id, data)
          : await createUser({ ...data, type });
      }

      await onSubmit(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const needsClub = type === 'entraineur';
  const canSubmit = !needsClub || lockedClub || registeredClubs.length > 0;
  const pageTitle = getFormTitle(type, isEdit);
  const pageSubtitle = getFormSubtitle(type, isEdit);

  return (
    <div className="form-card">
      <h2>{pageTitle}</h2>
      <p className="subtitle">{pageSubtitle}</p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {type === 'federation' && (
            <>
              <div className="form-group">
                <label>Nom <span className="required">*</span></label>
                <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Nom" />
              </div>
              <div className="form-group">
                <label>Prénom <span className="required">*</span></label>
                <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Prénom" />
              </div>
              <div className="form-group">
                <label>Fonction <span className="required">*</span></label>
                <select name="fonction" value={form.fonction} onChange={handleChange} required>
                  <option value="">— Sélectionner une fonction —</option>
                  {FEDERATION_ACCOUNT_FONCTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {type === 'membre' && (
            <>
              <div className="form-group">
                <label>Nom <span className="required">*</span></label>
                <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Nom" />
              </div>
              <div className="form-group">
                <label>Prénom <span className="required">*</span></label>
                <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Prénom" />
              </div>
              <div className="form-group">
                <label>Rôle <span className="required">*</span></label>
                <input
                  name="fonction"
                  value={form.fonction}
                  onChange={handleChange}
                  required
                  placeholder="Ex. Conseiller technique, Commissaire…"
                />
              </div>
            </>
          )}

          {type === 'ligue' && <OrgFields form={form} onChange={handleChange} nameLabel="Nom de la Ligue" />}
          {type === 'entente' && <OrgFields form={form} onChange={handleChange} nameLabel="Nom de l'Entente" />}

          {type === 'club' && (
            <>
              <div className="form-group">
                <label>Nom du club <span className="required">*</span></label>
                <input name="nom_club" value={form.nom_club} onChange={handleChange} required placeholder="Nom Club" />
              </div>
              <div className="form-group">
                <label>Province / Ville</label>
                <input name="ville" value={form.ville} onChange={handleChange} placeholder="" />
              </div>
              <div className="form-group">
                <label>Responsable</label>
                <input name="responsable" value={form.responsable} onChange={handleChange} placeholder="Nom du responsable" />
              </div>

              <EmailField form={form} onChange={handleChange} />
              <TelephoneField form={form} onChange={handleChange} />

              {CLUB_DOC_FIELDS.map(({ key, label }) => (
                <DocumentUploadField
                  key={key}
                  label={label}
                  file={clubDocs[key]}
                  preview={clubDocPreviews[key]}
                  onFileChange={(file) => setClubDocument(key, file)}
                  onClear={() => clearClubDocument(key)}
                  showCamera={activeCamera === key}
                  onToggleCamera={() => setActiveCamera((prev) => (prev === key ? null : key))}
                  onCameraCapture={(file) => { setClubDocument(key, file); setActiveCamera(null); }}
                />
              ))}
            </>
          )}

          {type === 'entraineur' && (
            <>
              <div className="form-group">
                <label>Nom <span className="required">*</span></label>
                <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Nom" />
              </div>
              <div className="form-group">
                <label>Prénom <span className="required">*</span></label>
                <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Prénom" />
              </div>
              <div className="form-group">
                <label>Club <span className="required">*</span></label>
                {lockedClub ? (
                  <input
                    name="club"
                    value={form.club}
                    onChange={handleChange}
                    readOnly
                    required
                    className="input-locked"
                  />
                ) : registeredClubs.length === 0 ? (
                  <p className="subtitle" style={{ margin: 0, color: 'var(--danger, #c0392b)' }}>
                    Aucun club enregistré. Créez d'abord un club avant d'ajouter un entraineur.
                  </p>
                ) : (
                  <select name="club" value={form.club} onChange={handleChange} required>
                    <option value="">— Sélectionner un club —</option>
                    {registeredClubs.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {form.club && !registeredClubs.includes(form.club) && (
                      <option value={form.club}>{form.club} (non enregistré)</option>
                    )}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label>Grade</label>
                <select name="grade" value={form.grade} onChange={handleChange}>
                  {GRADES.filter((g) => g.startsWith('Noire')).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {type !== 'club' && type !== 'membre' && type !== 'entraineur' && (
            <>
              <EmailField form={form} onChange={handleChange} />
              <TelephoneField form={form} onChange={handleChange} />
            </>
          )}

          {(type === 'membre' || type === 'entraineur') && (
            <>
              <div className="form-group">
                <label>Email (contact)</label>
                <input name="email" value={form.email} onChange={handleChange} placeholder="Optionnel" />
              </div>
              <TelephoneField form={form} onChange={handleChange} />
            </>
          )}

          {!isEdit && !isNoLogin && (
            <>
              <div className="form-group">
                <label>Mot de passe <span className="required">*</span></label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder=""
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Confirmer le mot de passe <span className="required">*</span></label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder=""
                  autoComplete="new-password"
                />
              </div>
            </>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !canSubmit}>
            {loading
              ? 'Enregistrement...'
              : isEdit
                ? 'Mettre à jour'
                : (FORM_COPY[type]?.createLabel || 'Créer l\'utilisateur')}
          </button>
        </div>
      </form>
    </div>
  );
}
