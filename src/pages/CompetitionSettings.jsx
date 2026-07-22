import { useState, useEffect, useCallback } from 'react';
import {
  fetchCompetition,
  updateCompetition,
  fetchCompetitionRegistrations,
  competitionPublicUrl,
} from '../api';

export default function CompetitionSettings({ onBack, onToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [form, setForm] = useState({
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCompetition();
      if (!data.access_ok && !data.can_toggle_access) {
        setError('Le bouton Compétition n\'est pas encore activé par Admin / Coordon.');
        setSettings(data);
        return;
      }
      setSettings(data);
      setForm({
        nom: data.nom || '',
        date_debut: data.date_debut || '',
        date_fin: data.date_fin || '',
        lieu: data.lieu || '',
        description: data.description || '',
      });
      if (data.access_ok || data.can_toggle_access) {
        const regs = await fetchCompetitionRegistrations().catch(() => []);
        setRegistrations(regs);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetition(form);
      setSettings((prev) => ({ ...prev, ...updated }));
      onToast?.('Paramètres de la compétition enregistrés');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetition({
        ...form,
        public_enabled: !settings.public_enabled,
      });
      setSettings((prev) => ({ ...prev, ...updated }));
      onToast?.(
        updated.public_enabled
          ? 'Lien du formulaire rendu public'
          : 'Formulaire public désactivé'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    const url = competitionPublicUrl(settings?.public_token);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onToast?.('Lien copié dans le presse-papiers');
    } catch {
      onToast?.('Impossible de copier le lien', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
        <p>Chargement de la compétition...</p>
      </div>
    );
  }

  const publicUrl = competitionPublicUrl(settings?.public_token);
  const accessBlocked = settings && !settings.access_ok && !settings.can_toggle_access;

  return (
    <div className="competition-page">
      <div className="form-card competition-settings-header">
        <div className="competition-settings-title-row">
          <div>
            <h2>Paramètres compétition</h2>
            <p className="subtitle">Configurez la compétition et publiez le lien d&apos;inscription pour les judokas.</p>
          </div>
          <button type="button" className="btn btn-outline" onClick={onBack}>
            Retour
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {accessBlocked ? (
        <div className="empty-state">
          <h3>Compétition non activée</h3>
          <p>Attendez qu&apos;un Admin ou Coordon active le bouton Compétition.</p>
        </div>
      ) : (
        <>
          <form className="form-card competition-form" onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="comp-nom">Nom de la compétition *</label>
                <input
                  id="comp-nom"
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  required
                  placeholder="Ex. Championnat National 2026"
                />
              </div>
              <div className="form-group">
                <label htmlFor="comp-lieu">Lieu *</label>
                <input
                  id="comp-lieu"
                  name="lieu"
                  value={form.lieu}
                  onChange={handleChange}
                  required
                  placeholder="Ville / salle"
                />
              </div>
              <div className="form-group">
                <label htmlFor="comp-debut">Date de début *</label>
                <input
                  id="comp-debut"
                  type="date"
                  name="date_debut"
                  value={form.date_debut}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="comp-fin">Date de fin</label>
                <input
                  id="comp-fin"
                  type="date"
                  name="date_fin"
                  value={form.date_fin}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor="comp-desc">Description</label>
                <textarea
                  id="comp-desc"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Informations utiles pour les judokas..."
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
              </button>
            </div>
          </form>

          <div className="form-card competition-public-panel">
            <div className="competition-public-header">
              <div>
                <h3>Formulaire d&apos;enregistrement public</h3>
                <p>
                  Une fois la compétition paramétrée, activez le lien pour permettre aux judokas de s&apos;inscrire.
                </p>
              </div>
              <label className="toggle-switch" title="Rendre le formulaire public">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.public_enabled)}
                  onChange={handleTogglePublic}
                  disabled={saving || !settings?.configured}
                />
                <span className="toggle-slider" />
                <span className="toggle-label">{settings?.public_enabled ? 'Public' : 'Privé'}</span>
              </label>
            </div>

            {settings?.public_enabled && publicUrl && (
              <div className="competition-link-row">
                <input type="text" readOnly value={publicUrl} className="competition-link-input" />
                <button type="button" className="btn btn-accent" onClick={handleCopyLink}>
                  Copier le lien
                </button>
                <a className="btn btn-outline" href={publicUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir
                </a>
              </div>
            )}

            {!settings?.configured && (
              <p className="form-hint">Renseignez le nom, la date et le lieu avant de publier le lien.</p>
            )}
          </div>

          <div className="form-card">
            <h3>Inscriptions ({registrations.length})</h3>
            {registrations.length === 0 ? (
              <p className="form-hint">Aucune inscription pour le moment.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Club</th>
                      <th>N° carte</th>
                      <th>Catégorie</th>
                      <th>Poids</th>
                      <th>Type</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Nom">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</td>
                        <td data-label="Club">{r.club || '—'}</td>
                        <td data-label="N° carte">{r.numero_carte || '—'}</td>
                        <td data-label="Catégorie">{r.categorie || '—'}</td>
                        <td data-label="Poids">{r.poids || '—'}</td>
                        <td data-label="Type">
                          <span className={`badge ${r.deja_enregistre ? 'badge-actif' : 'badge-pending'}`}>
                            {r.deja_enregistre ? 'Déjà enregistré' : 'Nouveau'}
                          </span>
                        </td>
                        <td data-label="Date">
                          {r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
