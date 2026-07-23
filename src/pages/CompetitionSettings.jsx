import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCompetition,
  updateCompetition,
  fetchCompetitionRegistrations,
  competitionPublicUrl,
  competitionWeighUrl,
} from '../api';

function formatDateFr(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return value;
  }
}

export default function CompetitionSettings({ onBack, onToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [liveTick, setLiveTick] = useState(false);
  const [form, setForm] = useState({
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
  });
  const formRef = useRef(form);
  const savingRef = useRef(false);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const loadInitial = useCallback(async () => {
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

  const refreshSilent = useCallback(async () => {
    if (savingRef.current) return;
    try {
      const [data, regs] = await Promise.all([
        fetchCompetition(),
        fetchCompetitionRegistrations().catch(() => null),
      ]);
      setSettings((prev) => ({ ...prev, ...data }));
      if (regs) setRegistrations(regs);
      setLiveTick((v) => !v);
    } catch {
      // silent background refresh
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (loading) return undefined;
    if (!settings?.access_ok && !settings?.can_toggle_access) return undefined;
    const id = setInterval(refreshSilent, 1000);
    return () => clearInterval(id);
  }, [loading, settings?.access_ok, settings?.can_toggle_access, refreshSilent]);

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
        ...formRef.current,
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

  const handleCopyLink = async (url) => {
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
  const weighUrl = competitionWeighUrl(settings?.public_token);
  const accessBlocked = settings && !settings.access_ok && !settings.can_toggle_access;
  const weighedCount = registrations.filter((r) => r.poids).length;

  return (
    <div className="competition-page">
      <header className="competition-hero">
        <div className="competition-hero-main">
          <div>
            <p className="competition-kicker">FENACOJU · Directeur Compétition</p>
            <h2>Compétition</h2>
            <p className="subtitle">
              Paramétrez l&apos;événement, publiez l&apos;inscription et suivez les judokas en direct.
            </p>
          </div>
          <div className="competition-hero-actions">
            <span className={`live-pill ${liveTick ? 'pulse' : ''}`} title="Actualisation automatique chaque seconde">
              <span className="live-dot" />
              Live
            </span>
            <button type="button" className="btn btn-outline" onClick={onBack}>
              Retour
            </button>
          </div>
        </div>

        {!accessBlocked && (
          <div className="competition-stats-strip">
            <div className="competition-stat">
              <strong>{registrations.length}</strong>
              <span>Judokas inscrits</span>
            </div>
            <div className="competition-stat">
              <strong>{weighedCount}</strong>
              <span>Pesés</span>
            </div>
            <div className="competition-stat">
              <strong>{settings?.public_enabled ? 'Oui' : 'Non'}</strong>
              <span>Formulaire public</span>
            </div>
            <div className="competition-stat">
              <strong>{settings?.lieu || '—'}</strong>
              <span>{formatDateFr(settings?.date_debut)}</span>
            </div>
          </div>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {accessBlocked ? (
        <div className="empty-state">
          <h3>Compétition non activée</h3>
          <p>Attendez qu&apos;un Admin ou Coordon active le bouton Compétition.</p>
        </div>
      ) : (
        <>
          <div className="competition-layout">
            <form className="form-card competition-form" onSubmit={handleSave}>
              <div className="competition-section-head">
                <h3>Paramètres</h3>
                <p>Informations affichées sur le formulaire public.</p>
              </div>
              <div className="form-grid">
                <div className="form-group form-group-full">
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
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <aside className="form-card competition-public-panel">
              <div className="competition-section-head">
                <h3>Publication</h3>
                <p>Rendez le formulaire d&apos;inscription accessible aux judokas.</p>
              </div>

              <div className="competition-public-header">
                <div>
                  <p className="competition-status-label">Statut du lien</p>
                  <strong>{settings?.public_enabled ? 'Public' : 'Privé'}</strong>
                </div>
                <label className="toggle-switch" title="Rendre le formulaire public">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.public_enabled)}
                    onChange={handleTogglePublic}
                    disabled={saving || !settings?.configured}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-label">{settings?.public_enabled ? 'On' : 'Off'}</span>
                </label>
              </div>

              {!settings?.configured && (
                <p className="form-hint">Renseignez le nom, la date et le lieu avant de publier.</p>
              )}

              {settings?.public_enabled && publicUrl && (
                <div className="competition-link-block">
                  <label>Lien d&apos;inscription</label>
                  <div className="competition-link-row">
                    <input type="text" readOnly value={publicUrl} className="competition-link-input" />
                    <button type="button" className="btn btn-accent" onClick={() => handleCopyLink(publicUrl)}>
                      Copier
                    </button>
                    <a className="btn btn-outline" href={publicUrl} target="_blank" rel="noopener noreferrer">
                      Ouvrir
                    </a>
                  </div>
                </div>
              )}
            </aside>
          </div>

          <section className="form-card competition-inscriptions">
            <div className="competition-inscriptions-head">
              <div>
                <h3>Inscriptions</h3>
                <p className="form-hint">
                  Liste actualisée en direct · {registrations.length} judoka{registrations.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="competition-inscriptions-actions">
                <a
                  className={`btn btn-primary ${!settings?.public_enabled || !settings?.configured ? 'is-disabled' : ''}`}
                  href={settings?.public_enabled && settings?.configured ? weighUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!settings?.public_enabled || !settings?.configured) {
                      e.preventDefault();
                      onToast?.('Publiez d\'abord le formulaire de compétition', 'error');
                    }
                  }}
                >
                  Pesé
                </a>
              </div>
            </div>

            {registrations.length === 0 ? (
              <div className="competition-empty-regs">
                <p>Aucun judoka inscrit pour le moment.</p>
                <p className="form-hint">Les nouvelles inscriptions apparaîtront ici automatiquement.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nom</th>
                      <th>Club</th>
                      <th>N° carte</th>
                      <th>Catégorie</th>
                      <th>Poids</th>
                      <th>Type</th>
                      <th>Inscription</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, idx) => (
                      <tr key={r.id}>
                        <td data-label="#">{registrations.length - idx}</td>
                        <td data-label="Nom">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</td>
                        <td data-label="Club">{r.club || '—'}</td>
                        <td data-label="N° carte">{r.numero_carte || '—'}</td>
                        <td data-label="Catégorie">{r.categorie || '—'}</td>
                        <td data-label="Poids">
                          {r.poids ? (
                            <span className="badge badge-actif">{r.poids} kg</span>
                          ) : (
                            <span className="badge badge-pending">À peser</span>
                          )}
                        </td>
                        <td data-label="Type">
                          <span className={`badge ${r.deja_enregistre ? 'badge-actif' : 'badge-pending'}`}>
                            {r.deja_enregistre ? 'Système' : 'Nouveau'}
                          </span>
                        </td>
                        <td data-label="Inscription">
                          {r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
