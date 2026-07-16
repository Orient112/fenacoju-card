import { useState, useEffect, useRef, useMemo } from 'react';

import { GRADES, CATEGORIES, resolveMediaUrl } from '../api';

import CameraCapture from './CameraCapture';

import SearchableSelect from './SearchableSelect';



const JUDOKA_FORM_FIELDS = [
  'nom',
  'prenom',
  'date_naissance',
  'sexe',
  'club',
  'entraineur_id',
  'entraineur_nom',
  'grade',
  'categorie',
  'numero_licence',
  'telephone',
  'email',
  'taille',
  'poids',
  'date_inscription',
  'statut',
];

const emptyForm = () => ({

  nom: '',

  prenom: '',

  date_naissance: '',

  sexe: 'M',

  club: '',

  entraineur_id: '',

  entraineur_nom: '',

  grade: 'Blanche',

  categorie: '',

  numero_licence: '',

  telephone: '',

  email: '',

  taille: '',

  poids: '',

  date_inscription: new Date().toISOString().split('T')[0],

  statut: 'actif',

});

function formFromJudoka(judoka) {
  const base = emptyForm();
  if (!judoka) return base;
  for (const key of JUDOKA_FORM_FIELDS) {
    if (judoka[key] != null && judoka[key] !== '') base[key] = judoka[key];
  }
  return base;
}



export default function JudokaForm({ judoka, lockedClub, registeredClubs = [], entraineurs = [], allowPhoto = true, onSubmit, onCancel }) {

  const initialForm = () => {

    const base = judoka ? formFromJudoka(judoka) : emptyForm();

    if (lockedClub && !judoka) base.club = lockedClub;

    return base;

  };



  const [form, setForm] = useState(initialForm());

  const [photo, setPhoto] = useState(null);

  const [photoPreview, setPhotoPreview] = useState(judoka?.photo || null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef(null);



  const filteredEntraineurs = useMemo(() => {

    if (!form.club) return entraineurs;

    const club = form.club.trim().toLowerCase();

    return entraineurs.filter((e) => !e.club || e.club.trim().toLowerCase() === club);

  }, [entraineurs, form.club]);



  useEffect(() => {

    if (judoka) {

      setForm(formFromJudoka(judoka));

      setPhotoPreview(judoka.photo || null);

    } else {

      const base = emptyForm();

      if (lockedClub) base.club = lockedClub;

      setForm(base);

      setPhotoPreview(null);

    }

    setPhoto(null);

    setError('');

  }, [judoka, lockedClub]);



  const setPhotoFile = (file) => {

    setPhoto(file);

    setPhotoPreview(URL.createObjectURL(file));

  };



  const handleFileSelect = (e) => {

    const file = e.target.files[0];

    if (file) setPhotoFile(file);

    e.target.value = '';

  };



  const handleChange = (e) => {

    const { name, value } = e.target;

    setForm((prev) => {

      const next = { ...prev, [name]: value };

      if (name === 'club') {

        next.entraineur_id = '';

        next.entraineur_nom = '';

      }

      return next;

    });

  };



  const handleEntraineurChange = (id, nom) => {

    setForm((prev) => ({ ...prev, entraineur_id: id, entraineur_nom: nom }));

  };



  const handleSubmit = async (e) => {

    e.preventDefault();

    setError('');

    setLoading(true);



    const formData = new FormData();

    JUDOKA_FORM_FIELDS.forEach((key) => {
      formData.append(key, form[key] ?? '');
    });

    if (photo) formData.append('photo', photo);



    try {

      await onSubmit(formData);

    } catch (err) {

      setError(err.message || 'Une erreur est survenue');

    } finally {

      setLoading(false);

    }

  };



  const canSubmit = lockedClub || registeredClubs.length > 0;



  return (

    <div className="form-card">

      <h2>{judoka ? 'Modifier le judoka' : 'Nouvel enregistrement'}</h2>

      <p className="subtitle">

        {judoka

          ? `Modification de ${judoka.prenom} ${judoka.nom} — Carte ${judoka.numero_carte}`

          : 'Remplissez le formulaire pour enregistrer un nouveau judoka et générer sa carte'}

      </p>



      {error && <div className="form-error">{error}</div>}



      <form onSubmit={handleSubmit}>

        <div className="form-grid">

          {allowPhoto && (
          <div className="form-group full-width">

            <label>Photo du judoka</label>



            {photoPreview && (
              <div className="photo-preview-wrap">
                <img src={resolveMediaUrl(photoPreview)} alt="Aperçu" className="photo-preview" />
                <button
                  type="button"
                  className="btn btn-outline btn-sm photo-remove"
                  onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                >
                  Supprimer la photo
                </button>
              </div>
            )}

            {!photoPreview && (
            <div className="photo-options">

              <div className="photo-option">

                <div className="photo-option-icon file-icon" />

                <h4>Depuis l'ordinateur</h4>

                <p>Choisir une image dans vos dossiers (JPG, PNG — max 5 Mo)</p>

                <input

                  ref={fileInputRef}

                  type="file"

                  accept="image/jpeg,image/png,image/webp"

                  onChange={handleFileSelect}

                  className="photo-option-input"

                />

                <button

                  type="button"

                  className="btn btn-outline"

                  onClick={() => fileInputRef.current?.click()}

                >

                  Parcourir les fichiers

                </button>

              </div>



              <div className="photo-option">

                <div className="photo-option-icon camera-icon" />

                <h4>Prendre une photo</h4>

                <p>Utiliser la webcam de votre appareil</p>

                <button

                  type="button"

                  className="btn btn-primary"

                  onClick={() => setShowCamera(true)}

                >

                  Ouvrir la caméra

                </button>

              </div>

            </div>
            )}

          </div>
          )}



          <div className="form-group">

            <label>Nom <span className="required">*</span></label>

            <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Nom" />

          </div>



          <div className="form-group">

            <label>Prénom <span className="required">*</span></label>

            <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Prénom" />

          </div>



          <div className="form-group">

            <label>Date de naissance <span className="required">*</span></label>

            <input type="date" name="date_naissance" value={form.date_naissance} onChange={handleChange} required />

          </div>



          <div className="form-group">

            <label>Sexe <span className="required">*</span></label>

            <select name="sexe" value={form.sexe} onChange={handleChange}>

              <option value="M">Masculin</option>

              <option value="F">Féminin</option>

            </select>

          </div>



            <div className="form-group">

              <label>Taille (cm)</label>

              <input
                name="taille"
                type="number"
                min="50"
                max="250"
                step="0.1"
                value={form.taille || ''}
                onChange={handleChange}
                placeholder="Ex. 172"
              />

            </div>



            <div className="form-group">

              <label>Poids (kg)</label>

              <input
                name="poids"
                type="number"
                min="10"
                max="250"
                step="0.1"
                value={form.poids || ''}
                onChange={handleChange}
                placeholder="Ex. 68"
              />

            </div>



            <div className="form-group">

            <label>Club / Dojo <span className="required">*</span></label>

            {lockedClub ? (

              <input

                name="club"

                value={form.club}

                onChange={handleChange}

                required

                placeholder="Nom Club"

                readOnly

                className="input-locked"

              />

            ) : registeredClubs.length === 0 ? (

              <p className="subtitle" style={{ margin: 0, color: 'var(--danger, #c0392b)' }}>

                Aucun club enregistré. Créez d'abord un club via le bouton « Créer ».

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

            <label>Entraineur</label>

            {entraineurs.length === 0 ? (

              <p className="subtitle" style={{ margin: 0, color: 'var(--text-muted)' }}>

                Aucun entraineur enregistré dans le système.

              </p>

            ) : (

              <SearchableSelect

                options={filteredEntraineurs}

                value={form.entraineur_id}

                onChange={handleEntraineurChange}

                placeholder="Rechercher par nom..."

                emptyLabel="— Aucun entraineur —"

              />

            )}

          </div>



          <div className="form-group">

            <label>Grade / Ceinture <span className="required">*</span></label>

            <select name="grade" value={form.grade} onChange={handleChange}>

              {GRADES.map((g) => (

                <option key={g} value={g}>{g}</option>

              ))}

            </select>

          </div>



          <div className="form-group">

            <label>Catégorie</label>

            <select name="categorie" value={form.categorie} onChange={handleChange}>

              <option value="">— Sélectionner —</option>

              {CATEGORIES.map((c) => (

                <option key={c} value={c}>{c}</option>

              ))}

            </select>

          </div>



          <div className="form-group">

            <label>N° de licence</label>

            <input name="numero_licence" value={form.numero_licence} onChange={handleChange} placeholder="LIC-2026-0001" />

          </div>



          <div className="form-group">

            <label>Téléphone</label>

            <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="+243 123456789" />

          </div>



          <div className="form-group">

            <label>Email</label>

            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="email@exemple.com" />

          </div>



          <div className="form-group">

            <label>Date d'inscription</label>

            <input type="date" name="date_inscription" value={form.date_inscription} onChange={handleChange} />

          </div>



          {judoka && (

            <div className="form-group">

              <label>Statut</label>

              <select name="statut" value={form.statut} onChange={handleChange}>

                <option value="actif">Actif</option>

                <option value="inactif">Inactif</option>

              </select>

            </div>

          )}

        </div>



        <div className="form-actions">

          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>

            Annuler

          </button>

          <button type="submit" className="btn btn-primary" disabled={loading || !canSubmit}>

            {loading ? 'Enregistrement...' : judoka ? 'Mettre à jour' : 'Enregistrer et générer la carte'}

          </button>

        </div>

      </form>



      {allowPhoto && showCamera && (

        <CameraCapture

          onCapture={setPhotoFile}

          onClose={() => setShowCamera(false)}

        />

      )}

    </div>

  );

}

