import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCompetition,
  updateCompetition,
  fetchCompetitionRegistrations,
  deleteCompetitionRegistration,
  updateCompetitionRegistration,
  deleteCompetitionPublicLink,
  competitionPublicUrl,
  competitionWeighUrl,
} from '../api';
import { exportCompetitionListToPdf } from '../utils/exportCompetitionListPdf';
import { exportCompetitionDrawToPdf } from '../utils/exportCompetitionDrawPdf';
import { buildWeightDraw, buildTeamDraw } from '../utils/competitionDraw';
import DrawAnimation from '../components/DrawAnimation';

function formatDateFr(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return value;
  }
}

function ParamsFormFields({ form, onChange, onCategoriesChange }) {
  const cats = Array.isArray(form.categories_poids) ? form.categories_poids : [];

  const updateCat = (index, value) => {
    const next = cats.map((c, i) => (i === index ? value : c));
    onCategoriesChange(next);
  };

  const addCat = () => onCategoriesChange([...cats, '']);
  const removeCat = (index) => onCategoriesChange(cats.filter((_, i) => i !== index));

  return (
    <div className="form-grid">
      <div className="form-group form-group-full">
        <label htmlFor="comp-nom">Nom de la compétition *</label>
        <input
          id="comp-nom"
          name="nom"
          value={form.nom}
          onChange={onChange}
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
          onChange={onChange}
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
          onChange={onChange}
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
          onChange={onChange}
        />
      </div>
      <div className="form-group form-group-full">
        <label htmlFor="comp-desc">Description</label>
        <textarea
          id="comp-desc"
          name="description"
          value={form.description}
          onChange={onChange}
          rows={3}
          placeholder="Informations utiles pour les judokas..."
        />
      </div>
      <div className="form-group form-group-full">
        <div className="club-comites-head">
          <label>Catégories de poids (Par équipe)</label>
          <button type="button" className="btn btn-outline btn-sm" onClick={addCat}>
            + Ajouter
          </button>
        </div>
        <p className="form-hint">
          Chaque club inscrit un Principal et un Remplaçant par catégorie.
          Pour le tirage, le club doit couvrir au moins 3 catégories de poids.
        </p>
        {cats.length === 0 ? (
          <p className="form-hint">Aucune catégorie pour le moment.</p>
        ) : (
          <div className="club-comites-list">
            {cats.map((value, index) => (
              <div key={`poids-${index}`} className="club-comite-row">
                <input
                  value={value}
                  onChange={(e) => updateCat(index, e.target.value)}
                  placeholder="Ex. 60"
                  aria-label={`Catégorie de poids ${index + 1}`}
                />
                <span className="form-hint" style={{ margin: 0 }}>kg</span>
                <button
                  type="button"
                  className="btn btn-danger btn-sm btn-icon"
                  title="Retirer"
                  onClick={() => removeCat(index)}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompetitionSettings({ onBack, onToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [liveTick, setLiveTick] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDrawModeModal, setShowDrawModeModal] = useState(false);
  const [drawResult, setDrawResult] = useState(null);
  const [drawAnimating, setDrawAnimating] = useState(false);
  const [deleteRegTarget, setDeleteRegTarget] = useState(null);
  const [editRegTarget, setEditRegTarget] = useState(null);
  const [editRegForm, setEditRegForm] = useState({ nom: '', prenom: '', poids: '' });
  const [form, setForm] = useState({
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
    categories_poids: [],
  });
  const formRef = useRef(form);
  const savingRef = useRef(false);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const applySettingsForm = (data) => {
    setForm({
      nom: data.nom || '',
      date_debut: data.date_debut || '',
      date_fin: data.date_fin || '',
      lieu: data.lieu || '',
      description: data.description || '',
      categories_poids: Array.isArray(data.categories_poids) ? data.categories_poids : [],
    });
  };

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
      applySettingsForm(data);
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
      // Si Admin/Coordon a reset (Off), synchroniser le formulaire local
      if (!data.configured || !data.nom) {
        setForm({
          nom: data.nom || '',
          date_debut: data.date_debut || '',
          date_fin: data.date_fin || '',
          lieu: data.lieu || '',
          description: data.description || '',
          categories_poids: Array.isArray(data.categories_poids) ? data.categories_poids : [],
        });
        setDrawResult(null);
        setShowParamsModal(false);
      }
      if (regs) setRegistrations(regs);
      else if (!data.configured) setRegistrations([]);
      setLiveTick((v) => !v);
    } catch {
      // silent
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

  const handleCategoriesChange = (next) => {
    setForm((prev) => ({ ...prev, categories_poids: next }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetition(form);
      setSettings((prev) => ({ ...prev, ...updated }));
      applySettingsForm(updated);
      setShowParamsModal(false);
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
          : 'Inscriptions clôturées'
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

  const handleDeleteLink = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await deleteCompetitionPublicLink();
      setSettings((prev) => ({ ...prev, ...updated }));
      setRegistrations([]);
      setDrawResult(null);
      setConfirmDelete(false);
      onToast?.('Lien supprimé et inscriptions effacées');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportList = async () => {
    if (!registrations.length) {
      onToast?.('Aucun inscrit à exporter', 'error');
      return;
    }
    setExporting(true);
    try {
      exportCompetitionListToPdf(registrations, settings || {});
      onToast?.('Liste exportée en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de l\'export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleTirageOpen = () => {
    const closed = Boolean(settings?.configured) && !settings?.public_enabled;
    if (registrations.length === 0) {
      onToast?.('Aucun judoka inscrit pour le tirage', 'error');
      return;
    }
    if (!closed) {
      onToast?.(
        'Le tirage au sort n\'est disponible qu\'après la clôture des inscriptions',
        'error'
      );
      return;
    }
    setDrawResult(null);
    setDrawAnimating(false);
    setShowDrawModeModal(true);
  };

  const handleTirageMode = (mode) => {
    const result = mode === 'equipe'
      ? buildTeamDraw(registrations)
      : buildWeightDraw(registrations);
    if (!result.groups.length) {
      onToast?.(
        mode === 'equipe'
          ? 'Aucun combat par équipe : chaque club doit avoir des judokas dans au moins 3 catégories de poids'
          : 'Aucun combat individuel possible (vérifiez les pesées)',
        'error'
      );
      return;
    }
    setDrawResult(result);
    setDrawAnimating(true);
  };

  const openEditRegistration = (reg) => {
    setEditRegTarget(reg);
    setEditRegForm({
      nom: reg.nom || '',
      prenom: reg.prenom || '',
      poids: reg.poids || '',
    });
  };

  const handleSaveRegistration = async (e) => {
    e.preventDefault();
    if (!editRegTarget) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompetitionRegistration(editRegTarget.id, {
        nom: editRegForm.nom,
        prenom: editRegForm.prenom,
        poids: editRegForm.poids,
      });
      setRegistrations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setEditRegTarget(null);
      onToast?.('Inscription mise à jour');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportGrilleCombat = () => {
    if (!drawResult?.groups?.length) {
      onToast?.('Aucune grille de combat à exporter', 'error');
      return;
    }
    try {
      exportCompetitionDrawToPdf(drawResult, settings || {});
      onToast?.('Grille de combat exportée en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de l\'export de la grille', 'error');
    }
  };

  const handleDeleteRegistration = async () => {
    if (!deleteRegTarget) return;
    setSaving(true);
    setError('');
    try {
      await deleteCompetitionRegistration(deleteRegTarget.id);
      setRegistrations((prev) => prev.filter((r) => r.id !== deleteRegTarget.id));
      setDeleteRegTarget(null);
      onToast?.('Judoka retiré de la compétition');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message, 'error');
    } finally {
      setSaving(false);
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
  const configured = Boolean(settings?.configured);
  const isPublic = Boolean(settings?.public_enabled);
  const isClosed = configured && !isPublic;
  const canWeigh = configured && isPublic;
  const weighedCount = registrations.filter((r) => r.poids).length;
  // Tirage actif si pesée clôturée, ou si le lien d'inscription est Off
  const tirageReady = isClosed && registrations.length > 0;

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
              <strong>{isPublic ? 'Ouvertes' : (configured ? 'Clôturées' : 'Non')}</strong>
              <span>Inscriptions</span>
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
          <div className={`competition-layout ${configured ? 'competition-layout-single' : ''}`}>
            {!configured && (
              <form className="form-card competition-form" onSubmit={handleSave}>
                <div className="competition-section-head">
                  <h3>Paramètres</h3>
                  <p>Renseignez ces informations pour activer la publication.</p>
                </div>
                <ParamsFormFields
                  form={form}
                  onChange={handleChange}
                  onCategoriesChange={handleCategoriesChange}
                />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}

            <aside className="form-card competition-public-panel">
              <div className="competition-section-head">
                <h3>Publication</h3>
                <p>Contrôlez l&apos;accès public aux inscriptions.</p>
              </div>

              <div className="competition-public-header">
                <div>
                  <p className="competition-status-label">Statut du lien</p>
                  <strong>{isPublic ? 'On' : 'Off'}</strong>
                </div>
                <label className="toggle-switch" title="Activer / clôturer les inscriptions">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={handleTogglePublic}
                    disabled={saving || !configured}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-label">{isPublic ? 'On' : 'Off'}</span>
                </label>
              </div>

              {!configured && (
                <p className="form-hint">Renseignez le nom, la date et le lieu avant de publier.</p>
              )}

              {isClosed && (
                <div className="competition-closed-banner">
                  <strong>Les Inscriptions sont clôturées</strong>
                  <p>Le lien public n&apos;accepte plus de nouvelles inscriptions.</p>
                </div>
              )}

              {configured && publicUrl && (
                <div className="competition-link-block">
                  <label>Lien d&apos;inscription</label>
                  <div className="competition-link-row">
                    <input
                      type="text"
                      readOnly
                      value={publicUrl}
                      className={`competition-link-input ${isClosed ? 'is-closed' : ''}`}
                    />
                    <button
                      type="button"
                      className="btn btn-accent"
                      onClick={() => handleCopyLink(publicUrl)}
                      disabled={isClosed}
                    >
                      Copier
                    </button>
                    <a
                      className={`btn btn-outline ${isClosed ? 'is-disabled' : ''}`}
                      href={isClosed ? undefined : publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (isClosed) e.preventDefault();
                      }}
                    >
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        applySettingsForm(settings);
                        setShowParamsModal(true);
                      }}
                    >
                      Paramètres de Compétition
                    </button>
                  </div>
                </div>
              )}

              {isClosed && (
                <div className="competition-delete-row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={saving}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Supprimer le lien
                  </button>
                  <p className="form-hint">
                    Rend le lien définitivement inaccessible et efface la liste des inscrits.
                  </p>
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
                  className={`btn btn-primary competition-action-btn ${!canWeigh ? 'is-disabled' : ''}`}
                  href={canWeigh ? weighUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!canWeigh) {
                      e.preventDefault();
                      onToast?.(
                        isClosed
                          ? 'La pesée est inactive tant que les inscriptions sont clôturées'
                          : 'Publiez d\'abord le formulaire de compétition',
                        'error'
                      );
                    }
                  }}
                >
                  Pesé
                </a>
                <button
                  type="button"
                  className="btn btn-outline competition-action-btn"
                  onClick={handleExportList}
                  disabled={exporting || registrations.length === 0}
                >
                  {exporting ? 'Export...' : 'Exporter Liste'}
                </button>
                <button
                  type="button"
                  className="btn btn-tirage competition-action-btn"
                  onClick={handleTirageOpen}
                  disabled={!tirageReady}
                  title={
                    tirageReady
                      ? 'Lancer le tirage au sort'
                      : 'Disponible uniquement après la clôture des inscriptions'
                  }
                >
                  Tirage au sort
                </button>
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
                      <th>Cadre</th>
                      <th>Type</th>
                      <th>Inscription</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r, idx) => (
                      <tr key={r.id}>
                        <td data-label="#">{registrations.length - idx}</td>
                        <td data-label="Nom">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</td>
                        <td data-label="Club">{r.club || '—'}</td>
                        <td data-label="N° carte">
                          {r.deja_enregistre ? (r.numero_carte || '—') : '—'}
                        </td>
                        <td data-label="Catégorie">{r.categorie || '—'}</td>
                        <td data-label="Poids">
                          {r.poids ? (
                            <span className="badge badge-actif">{r.poids} kg</span>
                          ) : (
                            <span className="badge badge-pending">À peser</span>
                          )}
                        </td>
                        <td data-label="Cadre">
                          <span className="badge badge-actif">
                            {r.mode_inscription === 'equipe' || String(r.taille || '').startsWith('__mode_equipe__') ? 'Équipe' : 'Individuel'}
                          </span>
                        </td>
                        <td data-label="Type">
                          <span className={`badge ${r.deja_enregistre ? 'badge-actif' : 'badge-pending'}`}>
                            {r.deja_enregistre ? 'Système' : 'Nouveau'}
                          </span>
                        </td>
                        <td data-label="Inscription">
                          {r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : '—'}
                        </td>
                        <td data-label="Actions">
                          <div className="actions-cell">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              title="Modifier"
                              onClick={() => openEditRegistration(r)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm btn-icon"
                              title="Supprimer"
                              onClick={() => setDeleteRegTarget(r)}
                            >
                              🗑️
                            </button>
                          </div>
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

      {showParamsModal && (
        <div className="confirm-overlay" onClick={() => setShowParamsModal(false)}>
          <div className="competition-params-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <h3>Paramètres de Compétition</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowParamsModal(false)}>
                Fermer
              </button>
            </div>
            <form onSubmit={handleSave}>
              <ParamsFormFields
                form={form}
                onChange={handleChange}
                onCategoriesChange={handleCategoriesChange}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowParamsModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer le lien ?</h3>
            <p>
              Cette action rend le lien définitivement inaccessible, efface tous les judokas inscrits
              et désactive la pesée. Continuer ?
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteLink} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRegTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteRegTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l&apos;inscription ?</h3>
            <p>
              Retirer{' '}
              <strong>{`${deleteRegTarget.prenom || ''} ${deleteRegTarget.nom || ''}`.trim()}</strong>
              {' '}de la compétition ?
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteRegTarget(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteRegistration} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editRegTarget && (
        <div className="confirm-overlay" onClick={() => setEditRegTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier l&apos;inscription</h3>
            <form onSubmit={handleSaveRegistration}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="edit-prenom">Prénom</label>
                  <input
                    id="edit-prenom"
                    value={editRegForm.prenom}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, prenom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-nom">Nom</label>
                  <input
                    id="edit-nom"
                    value={editRegForm.nom}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, nom: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group form-group-full">
                  <label htmlFor="edit-poids">Poids (kg)</label>
                  <input
                    id="edit-poids"
                    value={editRegForm.poids}
                    onChange={(e) => setEditRegForm((prev) => ({ ...prev, poids: e.target.value }))}
                    placeholder="Ex. 66"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditRegTarget(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDrawModeModal && (
        <div className="confirm-overlay" onClick={() => {
          if (drawAnimating) return;
          setShowDrawModeModal(false);
        }}>
          <div
            className={drawAnimating ? 'competition-draw-modal' : 'competition-draw-mode-modal'}
            onClick={(e) => e.stopPropagation()}
          >
            {drawAnimating && drawResult ? (
              <DrawAnimation
                items={
                  drawResult.mode === 'equipe'
                    ? drawResult.groups.flatMap((g) => g.matches.flatMap((m) => [m.clubA, m.clubB]))
                    : drawResult.groups.flatMap((g) => (g.seedOrder || []).map((s) => s.label))
                }
                title={drawResult.mode === 'equipe' ? 'Tirage par équipes' : 'Tirage individuel'}
                onDone={() => {
                  setDrawAnimating(false);
                  setShowDrawModeModal(false);
                }}
              />
            ) : (
              <>
                <div className="competition-params-modal-head">
                  <div>
                    <h3>Tirage au sort</h3>
                    <p className="form-hint">Choisissez le mode de classement des combats.</p>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowDrawModeModal(false)}>
                    Fermer
                  </button>
                </div>
                <div className="competition-draw-mode-actions">
                  <button type="button" className="btn btn-tirage competition-draw-mode-btn" onClick={() => handleTirageMode('individuel')}>
                    Individuel
                  </button>
                  <button type="button" className="btn btn-primary competition-draw-mode-btn" onClick={() => handleTirageMode('equipe')}>
                    Par Equipe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {drawResult && !drawAnimating && (
        <div className="confirm-overlay" onClick={() => setDrawResult(null)}>
          <div className="competition-draw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <div>
                <h3>Tirage au sort · {drawResult.modeLabel}</h3>
                <p className="form-hint">
                  {drawResult.totalFights} combat{drawResult.totalFights > 1 ? 's' : ''} · {drawResult.totalJudokas} judoka{drawResult.totalJudokas > 1 ? 's' : ''}
                  {drawResult.mode === 'individuel' ? ' · par poids (Garçons / Filles)' : ' · clubs puis catégories de poids'}
                </p>
              </div>
              <div className="competition-inscriptions-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setDrawResult(null); setShowDrawModeModal(true); }}>
                  Mode
                </button>
                <button type="button" className="btn btn-tirage" onClick={handleExportGrilleCombat}>
                  Grille de Combat
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawResult(null)}>
                  Fermer
                </button>
              </div>
            </div>

            <div className="competition-draw-groups">
              {drawResult.groups.map((group) => (
                <section key={group.key} className="competition-draw-group">
                  <header>
                    <h4>{group.title}</h4>
                    <span>{group.count} judoka{group.count > 1 ? 's' : ''}</span>
                  </header>
                  {group.mode === 'equipe' ? (
                    <>
                      {(group.matches || []).length === 0 && !group.bye && (
                        <p className="form-hint">Pas de rencontre d&apos;équipes dans cette catégorie.</p>
                      )}
                      <ul className="competition-draw-team-matches">
                        {(group.matches || []).map((match) => (
                          <li key={match.id} className="competition-draw-team-match">
                            <p className="competition-draw-club-vs">
                              <strong>{match.clubA}</strong>
                              <span className="competition-draw-vs">vs</span>
                              <strong>{match.clubB}</strong>
                            </p>
                            <ul className="competition-draw-fights">
                              {(match.byWeight || [{ poids: group.poids, fights: match.fights }]).flatMap((bucket) =>
                                bucket.fights.map((fight, idx) => (
                                  <li key={fight.id}>
                                    <span className="competition-draw-fight-num">
                                      {bucket.poids} kg · Combat {idx + 1}
                                    </span>
                                    <strong>{fight.labelA}</strong>
                                    <span className="competition-draw-vs">vs</span>
                                    <strong>{fight.labelB}</strong>
                                  </li>
                                ))
                              )}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      {group.fights.length === 0 && !group.bye && (
                        <p className="form-hint">Pas de combat dans cette catégorie.</p>
                      )}
                      <ul className="competition-draw-fights">
                        {group.fights.map((fight, idx) => (
                          <li key={fight.id}>
                            <span className="competition-draw-fight-num">Combat {idx + 1}</span>
                            <strong>{fight.labelA}</strong>
                            <span className="competition-draw-vs">vs</span>
                            <strong>{fight.labelB}</strong>
                            <p>
                              {(fight.a.club || '—')} · {(fight.b.club || '—')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {group.bye && (
                    <p className="competition-draw-bye">
                      Exempt : <strong>{group.bye.label}</strong>
                      {group.bye.club ? ` (${group.bye.club})` : ''}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
