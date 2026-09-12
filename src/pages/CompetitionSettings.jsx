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
import { exportCompetitionBadgesToPdf } from '../utils/exportCompetitionBadgesPdf';
import { buildWeightDraw, buildTeamDraw } from '../utils/competitionDraw';
import DrawAnimation from '../components/DrawAnimation';

function isTeamRegistration(r) {
  return r?.mode_inscription === 'equipe' || String(r?.taille || '').startsWith('__mode_equipe__');
}

function teamMemberRole(m) {
  if (m?.role === 'remplacant' || m?.role_equipe === 'remplacant') return 'remplacant';
  const raw = String(m?.role || m?.role_equipe || m?.taille || '').toLowerCase();
  if (raw.includes('remplac')) return 'remplacant';
  return 'principal';
}

function teamMemberCategory(m) {
  const raw = String(m?.categorie || '').trim();
  if (raw && !/principal|rempl/i.test(raw)) return raw;
  return 'Sans catégorie';
}

function groupEditMembersByCategory(members) {
  const map = new Map();
  for (const m of members || []) {
    const cat = teamMemberCategory(m);
    const sexe = m.sexe === 'F' ? 'F' : 'M';
    const key = `${sexe}|${cat}`;
    if (!map.has(key)) {
      map.set(key, { key, cat, sexe, principal: null, remplacant: null });
    }
    const bucket = map.get(key);
    const role = teamMemberRole(m);
    if (role === 'remplacant' && !bucket.remplacant) bucket.remplacant = m;
    else if (!bucket.principal) bucket.principal = m;
    else if (!bucket.remplacant) bucket.remplacant = m;
  }
  return [...map.values()].sort((a, b) => {
    if (a.sexe !== b.sexe) return a.sexe === 'M' ? -1 : 1;
    return a.cat.localeCompare(b.cat, 'fr', { numeric: true });
  });
}

function groupTeamClubs(registrations) {
  const map = new Map();
  for (const r of registrations || []) {
    const club = (r.club || '').trim() || 'Sans club';
    if (!map.has(club)) map.set(club, { club, ids: [], members: [] });
    const team = map.get(club);
    team.ids.push(r.id);
    team.members.push(r);
  }
  return [...map.values()].sort((a, b) => a.club.localeCompare(b.club, 'fr'));
}

function mergeRegisteredTeamClubs(registeredClubs, registrations) {
  const fromRegs = groupTeamClubs(registrations.filter((r) => isTeamRegistration(r)));
  const byName = new Map(fromRegs.map((team) => [String(team.club).trim().toLowerCase(), team]));
  const merged = [];

  for (const club of (registeredClubs || []).filter((c) => c.cadre === 'equipe')) {
    const key = String(club.nom || '').trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      merged.push({ ...existing, club: club.nom });
      byName.delete(key);
    } else {
      merged.push({ club: club.nom, ids: [], members: [] });
    }
  }

  for (const leftover of byName.values()) merged.push(leftover);
  return merged.sort((a, b) => a.club.localeCompare(b.club, 'fr'));
}

function formatDateFr(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return value;
  }
}

function RegistrationsTable({ registrations, onEdit, onDelete }) {
  if (!registrations.length) {
    return (
      <div className="competition-empty-regs">
        <p>Aucun inscrit.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Club</th>
            <th>Poids</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((r) => (
            <tr key={r.id}>
              <td data-label="Nom">{`${r.prenom || ''} ${r.nom || ''}`.trim()}</td>
              <td data-label="Club">{r.club || '—'}</td>
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
              <td data-label="Actions">
                <div className="actions-cell">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    title="Modifier"
                    onClick={() => onEdit(r)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm btn-icon"
                    title="Supprimer"
                    onClick={() => onDelete(r)}
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
  );
}

function TeamClubsTable({ clubs, onEdit, onDelete }) {
  if (!clubs.length) {
    return (
      <div className="competition-empty-regs">
        <p>Aucun club inscrit.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Club</th>
            <th>Judokas</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((team) => (
            <tr key={team.club}>
              <td data-label="Club">{team.club}</td>
              <td data-label="Judokas">{team.members?.length || team.ids.length}</td>
              <td data-label="Actions">
                <div className="actions-cell">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Modifier"
                    onClick={() => onEdit(team)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm btn-icon"
                    title="Supprimer l'équipe"
                    onClick={() => onDelete(team)}
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
  );
}

function ParamsFormFields({ form, onChange, onCategoriesChange, onIndividualCategoriesChange }) {
  const teamCats = Array.isArray(form.categories_poids) ? form.categories_poids : [];
  const individualCats = Array.isArray(form.categories_poids_individuel) ? form.categories_poids_individuel : [];

  const renderCatEditor = (cats, onUpdate, prefix) => {
    const updateCat = (index, field, value) => {
      const next = cats.map((c, i) => {
        if (i !== index) return c;
        const current = (c && typeof c === 'object') ? c : { min: c, max: c, label: c };
        return { ...current, [field]: value };
      });
      onUpdate(next);
    };
    const addCat = (sexe) => onUpdate([...cats, { sexe, label: '', min: '', max: '' }]);
    const removeCat = (index) => onUpdate(cats.filter((_, i) => i !== index));

    const renderSexGroup = (sexe, title) => {
      const rows = cats
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => {
          const current = (value && typeof value === 'object') ? value : {};
          const s = String(current.sexe || 'M').toUpperCase().startsWith('F') ? 'F' : 'M';
          return s === sexe;
        });

      return (
        <div className="competition-cat-sex-group">
          <div className="club-comites-head">
            <label>{title}</label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => addCat(sexe)}>
              + Ajouter
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="form-hint">Aucune catégorie {title.toLowerCase()} pour le moment.</p>
          ) : (
            <div className="club-comites-list">
              {rows.map(({ value, index }) => {
                const cat = (value && typeof value === 'object') ? value : { label: value, min: value, max: value };
                return (
                  <div key={`${prefix}-${sexe}-${index}`} className="club-comite-row club-comite-row-cat">
                    <input
                      value={cat.label ?? ''}
                      onChange={(e) => updateCat(index, 'label', e.target.value)}
                      placeholder="Ex. -60"
                      aria-label={`Catégorie ${title} ${index + 1}`}
                    />
                    <span className="form-hint" style={{ margin: 0 }}>de</span>
                    <input
                      value={cat.min ?? ''}
                      onChange={(e) => updateCat(index, 'min', e.target.value)}
                      placeholder="Ex. 0"
                      inputMode="decimal"
                      aria-label={`Poids minimum ${title} ${index + 1}`}
                    />
                    <span className="form-hint" style={{ margin: 0 }}>à</span>
                    <input
                      value={cat.max ?? ''}
                      onChange={(e) => updateCat(index, 'max', e.target.value)}
                      placeholder="Ex. 60"
                      inputMode="decimal"
                      aria-label={`Poids maximum ${title} ${index + 1}`}
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
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        {renderSexGroup('M', 'Garçon')}
        {renderSexGroup('F', 'Fille')}
      </>
    );
  };

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
      <div className="competition-cat-block competition-cat-block-indiv">
        <div className="competition-cat-block-head">
          <span className="competition-cat-block-kicker">Individuel</span>
          <h4>Catégories de poids</h4>
        </div>
        {renderCatEditor(individualCats, onIndividualCategoriesChange, 'indiv')}
      </div>
      <div className="competition-cat-separator" aria-hidden="true" />
      <div className="competition-cat-block competition-cat-block-team">
        <div className="competition-cat-block-head">
          <span className="competition-cat-block-kicker">Par équipe</span>
          <h4>Catégories de poids</h4>
        </div>
        {renderCatEditor(teamCats, onCategoriesChange, 'equipe')}
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
  const [drawResult, setDrawResult] = useState(null);
  const [drawAnimating, setDrawAnimating] = useState(false);
  const [actionMode, setActionMode] = useState(null);
  const [deleteRegTarget, setDeleteRegTarget] = useState(null);
  const [deleteClubTarget, setDeleteClubTarget] = useState(null);
  const [editRegTarget, setEditRegTarget] = useState(null);
  const [editRegForm, setEditRegForm] = useState({ nom: '', prenom: '', poids: '' });
  const [editTeamTarget, setEditTeamTarget] = useState(null);
  const [editTeamClub, setEditTeamClub] = useState('');
  const [editTeamMembers, setEditTeamMembers] = useState([]);
  const [clubsEditorCadre, setClubsEditorCadre] = useState(null);
  const [clubDraft, setClubDraft] = useState('');
  const [editingClub, setEditingClub] = useState(null);
  const [form, setForm] = useState({
    nom: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    description: '',
    categories_poids: [],
    categories_poids_individuel: [],
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
      categories_poids_individuel: Array.isArray(data.categories_poids_individuel) ? data.categories_poids_individuel : [],
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
          categories_poids_individuel: Array.isArray(data.categories_poids_individuel) ? data.categories_poids_individuel : [],
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

  const handleIndividualCategoriesChange = (next) => {
    setForm((prev) => ({ ...prev, categories_poids_individuel: next }));
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

  const handleExportList = async (mode) => {
    const list = registrations.filter((r) => (mode === 'equipe') === isTeamRegistration(r));
    if (!list.length) {
      onToast?.(mode === 'equipe' ? 'Aucun inscrit par équipe à exporter' : 'Aucun inscrit individuel à exporter', 'error');
      return;
    }
    setExporting(true);
    try {
      exportCompetitionListToPdf(list, { ...(settings || {}), cadre: mode === 'equipe' ? 'Par équipe' : 'Individuel' });
      onToast?.('Liste exportée en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de l\'export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportBadges = async (mode) => {
    const list = registrations.filter((r) => (mode === 'equipe') === isTeamRegistration(r));
    if (!list.length) {
      onToast?.(mode === 'equipe' ? 'Aucun inscrit par équipe pour les badges' : 'Aucun inscrit individuel pour les badges', 'error');
      return;
    }
    setExporting(true);
    try {
      exportCompetitionBadgesToPdf(list, settings || {}, mode);
      onToast?.('Badges A6 exportés en PDF');
    } catch (err) {
      onToast?.(err.message || 'Erreur lors de la génération des badges', 'error');
    } finally {
      setExporting(false);
    }
  };

  const openActionMode = (action) => {
    if (action === 'clubs') {
      setActionMode('clubs');
      return;
    }
    if (action === 'weigh') {
      if (!canWeigh) {
        onToast?.(
          isClosed
            ? 'La pesée est inactive tant que les inscriptions sont clôturées'
            : 'Publiez d\'abord le formulaire de compétition',
          'error'
        );
        return;
      }
      setActionMode('weigh');
      return;
    }
    if (action === 'export') {
      if (!registrations.length) {
        onToast?.('Aucun inscrit à exporter', 'error');
        return;
      }
      setActionMode('export');
      return;
    }
    if (action === 'badges') {
      const linkOff = Boolean(settings?.configured) && !settings?.public_enabled;
      if (!linkOff) {
        onToast?.('Les badges sont disponibles uniquement lorsque le lien d\'inscription est Off', 'error');
        return;
      }
      if (!registrations.length) {
        onToast?.('Aucun judoka inscrit pour générer les badges', 'error');
        return;
      }
      setActionMode('badges');
      return;
    }
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
    setActionMode('draw');
  };

  const handleActionMode = (mode) => {
    if (actionMode === 'clubs') {
      setActionMode(null);
      setClubsEditorCadre(mode);
      setClubDraft('');
      setEditingClub(null);
      return;
    }
    if (actionMode === 'weigh') {
      const url = competitionWeighUrl(settings?.public_token, mode);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      setActionMode(null);
      return;
    }
    if (actionMode === 'export') {
      setActionMode(null);
      handleExportList(mode);
      return;
    }
    if (actionMode === 'badges') {
      setActionMode(null);
      handleExportBadges(mode);
      return;
    }
    handleTirageMode(mode);
  };

  const persistCompetitionClubs = async (nextClubs) => {
    const updated = await updateCompetition({ competition_clubs: nextClubs });
    setSettings((prev) => ({ ...prev, ...updated }));
  };

  const handleAddCompetitionClub = async (e) => {
    e.preventDefault();
    const nom = clubDraft.trim();
    if (!nom || !clubsEditorCadre) return;
    const current = settings?.competition_clubs || [];
    if (current.some((c) => c.cadre === clubsEditorCadre && String(c.nom).toLowerCase() === nom.toLowerCase())) {
      onToast?.('Ce club est déjà enregistré pour ce cadre', 'error');
      return;
    }
    setSaving(true);
    try {
      await persistCompetitionClubs([...current, { nom, cadre: clubsEditorCadre }]);
      setClubDraft('');
      onToast?.('Club enregistré');
    } catch (err) {
      onToast?.(err.message || 'Impossible d\'enregistrer le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCompetitionClub = async (club) => {
    const current = settings?.competition_clubs || [];
    setSaving(true);
    try {
      await persistCompetitionClubs(current.filter((c) => c.id !== club.id));
      setEditingClub((prev) => (prev?.id === club.id ? null : prev));
      onToast?.('Club retiré');
    } catch (err) {
      onToast?.(err.message || 'Impossible de retirer le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditedClub = async (club) => {
    const nom = String(editingClub?.nom || '').trim();
    if (!nom) {
      onToast?.('Le nom du club est obligatoire', 'error');
      return;
    }
    const current = settings?.competition_clubs || [];
    if (current.some((c) => c.id !== club.id && c.cadre === club.cadre && String(c.nom).toLowerCase() === nom.toLowerCase())) {
      onToast?.('Ce club est déjà enregistré pour ce cadre', 'error');
      return;
    }
    const oldName = club.nom;
    setSaving(true);
    try {
      await persistCompetitionClubs(current.map((c) => (c.id === club.id ? { ...c, nom } : c)));
      const affected = registrations.filter((r) => {
        const isTeam = isTeamRegistration(r);
        if (club.cadre === 'equipe' && !isTeam) return false;
        if (club.cadre === 'individuel' && isTeam) return false;
        return (r.club || '').trim().toLowerCase() === String(oldName).trim().toLowerCase();
      });
      const updatedList = [];
      for (const row of affected) {
        const updated = await updateCompetitionRegistration(row.id, {
          club: nom,
          nom: row.nom,
          prenom: row.prenom,
          poids: row.poids,
        });
        updatedList.push(updated);
      }
      if (updatedList.length) {
        const byId = new Map(updatedList.map((row) => [row.id, row]));
        setRegistrations((prev) => prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)));
      }
      setEditingClub(null);
      onToast?.('Club modifié');
    } catch (err) {
      onToast?.(err.message || 'Impossible de modifier le club', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTirageMode = (mode) => {
    const result = mode === 'equipe'
      ? buildTeamDraw(registrations)
      : buildWeightDraw(registrations, settings?.categories_poids_individuel);
    if (!result.groups.length) {
      onToast?.(
        mode === 'equipe'
          ? 'Aucun combat par équipe : chaque club doit avoir des judokas dans au moins 3 catégories du même sexe'
          : 'Aucun combat individuel possible (vérifiez les pesées)',
        'error'
      );
      return;
    }
    setActionMode(null);
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

  const openEditTeam = (team) => {
    setEditTeamTarget(team);
    setEditTeamClub(team.club || '');
    setEditTeamMembers((team.members || []).map((m) => ({
      id: m.id,
      nom: m.nom || '',
      prenom: m.prenom || '',
      poids: m.poids || '',
      categorie: m.categorie || '',
      sexe: m.sexe === 'F' ? 'F' : 'M',
      role: teamMemberRole(m),
      role_equipe: m.role_equipe,
      taille: m.taille,
    })));
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!editTeamTarget) return;
    const club = editTeamClub.trim();
    if (!club) {
      onToast?.('Le nom du club est obligatoire', 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editTeamMembers.length) {
        const updatedList = [];
        for (const member of editTeamMembers) {
          const updated = await updateCompetitionRegistration(member.id, {
            club,
            nom: member.nom,
            prenom: member.prenom,
            poids: member.poids,
          });
          updatedList.push(updated);
        }
        const byId = new Map(updatedList.map((row) => [row.id, row]));
        setRegistrations((prev) => prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r)));
      }
      const current = settings?.competition_clubs || [];
      const oldName = String(editTeamTarget.club || '').trim().toLowerCase();
      const nextClubs = current.map((c) => (
        c.cadre === 'equipe' && String(c.nom || '').trim().toLowerCase() === oldName
          ? { ...c, nom: club }
          : c
      ));
      if (JSON.stringify(nextClubs) !== JSON.stringify(current)) {
        await persistCompetitionClubs(nextClubs);
      }
      setEditTeamTarget(null);
      onToast?.('Équipe mise à jour');
    } catch (err) {
      setError(err.message);
      onToast?.(err.message || 'Impossible de modifier l\'équipe', 'error');
    } finally {
      setSaving(false);
    }
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

  const handleDeleteClubTeam = async () => {
    if (!deleteClubTarget) return;
    setSaving(true);
    setError('');
    try {
      if (deleteClubTarget.ids?.length) {
        await Promise.all(deleteClubTarget.ids.map((id) => deleteCompetitionRegistration(id)));
        const ids = new Set(deleteClubTarget.ids);
        setRegistrations((prev) => prev.filter((r) => !ids.has(r.id)));
      }
      const current = settings?.competition_clubs || [];
      const target = String(deleteClubTarget.club || '').trim().toLowerCase();
      const nextClubs = current.filter((c) => !(
        c.cadre === 'equipe' && String(c.nom || '').trim().toLowerCase() === target
      ));
      if (nextClubs.length !== current.length) {
        await persistCompetitionClubs(nextClubs);
      }
      setDeleteClubTarget(null);
      onToast?.('Équipe du club retirée de la compétition');
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
  const accessBlocked = settings && !settings.access_ok && !settings.can_toggle_access;
  const configured = Boolean(settings?.configured);
  const isPublic = Boolean(settings?.public_enabled);
  const isClosed = configured && !isPublic;
  const canWeigh = configured && isPublic;
  const weighedCount = registrations.filter((r) => r.poids).length;
  const individualCount = registrations.filter((r) => !isTeamRegistration(r)).length;
  const teamCount = registrations.length - individualCount;
  const individualWeighed = registrations.filter((r) => !isTeamRegistration(r) && r.poids).length;
  const teamWeighed = registrations.filter((r) => isTeamRegistration(r) && r.poids).length;
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
              <small>Individuel {individualCount} · Par équipe {teamCount}</small>
            </div>
            <div className="competition-stat">
              <strong>{weighedCount}</strong>
              <span>Pesés</span>
              <small>Individuel {individualWeighed} · Par équipe {teamWeighed}</small>
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
                  onIndividualCategoriesChange={handleIndividualCategoriesChange}
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
                <button
                  type="button"
                  className="btn btn-outline competition-action-btn"
                  onClick={() => openActionMode('clubs')}
                >
                  Club
                </button>
                <button
                  type="button"
                  className={`btn btn-primary competition-action-btn ${!canWeigh ? 'is-disabled' : ''}`}
                  onClick={() => openActionMode('weigh')}
                >
                  Pesé
                </button>
                <button
                  type="button"
                  className="btn btn-outline competition-action-btn"
                  onClick={() => openActionMode('export')}
                  disabled={exporting || registrations.length === 0}
                >
                  {exporting && actionMode !== 'badges' ? 'Export...' : 'Exporter Liste'}
                </button>
                <button
                  type="button"
                  className={`btn btn-outline competition-action-btn ${!tirageReady ? 'is-disabled' : ''}`}
                  onClick={() => openActionMode('badges')}
                  disabled={exporting || !tirageReady}
                  title={
                    tirageReady
                      ? 'Générer les badges A6'
                      : 'Disponible uniquement après la clôture des inscriptions'
                  }
                >
                  {exporting && actionMode === 'badges' ? 'Export...' : 'Badges'}
                </button>
                <button
                  type="button"
                  className="btn btn-tirage competition-action-btn"
                  onClick={() => openActionMode('draw')}
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

            {registrations.length === 0 && mergeRegisteredTeamClubs(settings?.competition_clubs, registrations).length === 0 ? (
              <div className="competition-empty-regs">
                <p>Aucun judoka inscrit pour le moment.</p>
                <p className="form-hint">Les nouvelles inscriptions apparaîtront ici automatiquement.</p>
              </div>
            ) : (
              <div className="competition-inscriptions-split">
                <div className="competition-inscriptions-pane">
                  <h4>Individuel</h4>
                  <RegistrationsTable
                    registrations={registrations.filter((r) => !isTeamRegistration(r))}
                    onEdit={openEditRegistration}
                    onDelete={setDeleteRegTarget}
                  />
                </div>
                <div className="competition-inscriptions-pane">
                  <h4>Par Équipe</h4>
                  <TeamClubsTable
                    clubs={mergeRegisteredTeamClubs(settings?.competition_clubs, registrations)}
                    onEdit={openEditTeam}
                    onDelete={setDeleteClubTarget}
                  />
                </div>
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
                onIndividualCategoriesChange={handleIndividualCategoriesChange}
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

      {deleteClubTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteClubTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l&apos;équipe ?</h3>
            <p>
              {(deleteClubTarget.ids?.length || 0) > 0
                ? <>Retirer le club <strong>{deleteClubTarget.club}</strong> et tous ses judokas d&apos;équipe ?</>
                : <>Retirer le club <strong>{deleteClubTarget.club}</strong> de la liste Par équipe ?</>}
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteClubTarget(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteClubTeam} disabled={saving}>
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

      {editTeamTarget && (
        <div className="confirm-overlay" onClick={() => setEditTeamTarget(null)}>
          <div className="confirm-dialog competition-team-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier l&apos;équipe</h3>
            <form onSubmit={handleSaveTeam}>
              <div className="form-group">
                <label htmlFor="edit-team-club">Nom du club</label>
                <input
                  id="edit-team-club"
                  value={editTeamClub}
                  onChange={(e) => setEditTeamClub(e.target.value)}
                  required
                />
              </div>
              <div className="competition-team-edit-list">
                {editTeamMembers.length === 0 && (
                  <p className="form-hint">Aucun judoka n&apos;est encore rattaché à ce club.</p>
                )}
                {groupEditMembersByCategory(editTeamMembers).map((bucket) => (
                  <section key={bucket.key} className="competition-team-edit-cat">
                    <h4>
                      {bucket.cat}
                      <span> · {bucket.sexe === 'F' ? 'Fille' : 'Garçon'}</span>
                    </h4>
                    {['principal', 'remplacant'].map((role) => {
                      const member = bucket[role];
                      if (!member) return null;
                      return (
                        <div key={member.id} className="competition-team-edit-row">
                          <p className="form-hint">{role === 'principal' ? 'Principal' : 'Remplaçant'}</p>
                          <div className="form-grid">
                            <div className="form-group">
                              <label htmlFor={`edit-team-prenom-${member.id}`}>Prénom</label>
                              <input
                                id={`edit-team-prenom-${member.id}`}
                                value={member.prenom}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, prenom: e.target.value } : row
                                )))}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-team-nom-${member.id}`}>Nom</label>
                              <input
                                id={`edit-team-nom-${member.id}`}
                                value={member.nom}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, nom: e.target.value } : row
                                )))}
                                required
                              />
                            </div>
                            <div className="form-group form-group-full">
                              <label htmlFor={`edit-team-poids-${member.id}`}>Poids (kg)</label>
                              <input
                                id={`edit-team-poids-${member.id}`}
                                value={member.poids}
                                onChange={(e) => setEditTeamMembers((prev) => prev.map((row) => (
                                  row.id === member.id ? { ...row, poids: e.target.value } : row
                                )))}
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditTeamTarget(null)}>
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

      {clubsEditorCadre && (
        <div className="confirm-overlay" onClick={() => setClubsEditorCadre(null)}>
          <div className="confirm-dialog competition-team-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clubs · {clubsEditorCadre === 'equipe' ? 'Par équipe' : 'Individuel'}</h3>
            <form onSubmit={handleAddCompetitionClub}>
              <div className="form-group">
                <label htmlFor="competition-club-name">Nom du club</label>
                <input
                  id="competition-club-name"
                  value={clubDraft}
                  onChange={(e) => setClubDraft(e.target.value)}
                  placeholder="Ex. Club Judo Kinshasa"
                  autoFocus
                />
              </div>
              <div className="confirm-actions" style={{ marginBottom: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving || !clubDraft.trim()}>
                  {saving ? 'Enregistrement...' : 'Ajouter'}
                </button>
              </div>
            </form>
            {(settings?.competition_clubs || []).filter((c) => c.cadre === clubsEditorCadre).length === 0 ? (
              <p className="form-hint">Aucun club enregistré pour ce cadre.</p>
            ) : (
              <ul className="competition-club-editor-list">
                {(settings?.competition_clubs || [])
                  .filter((c) => c.cadre === clubsEditorCadre)
                  .map((club) => (
                    <li key={club.id}>
                      {editingClub?.id === club.id ? (
                        <input
                          value={editingClub.nom}
                          onChange={(e) => setEditingClub((prev) => ({ ...prev, nom: e.target.value }))}
                          aria-label="Nouveau nom du club"
                        />
                      ) : (
                        <span>{club.nom}</span>
                      )}
                      <div className="actions-cell">
                        {editingClub?.id === club.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={saving}
                              onClick={() => handleSaveEditedClub(club)}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingClub(null)}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm btn-icon"
                            title="Modifier"
                            disabled={saving}
                            onClick={() => setEditingClub({ id: club.id, nom: club.nom })}
                          >
                            ✏️
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm btn-icon"
                          title="Retirer"
                          disabled={saving}
                          onClick={() => handleRemoveCompetitionClub(club)}
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setClubsEditorCadre(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMode && !drawAnimating && (
        <div className="confirm-overlay" onClick={() => setActionMode(null)}>
          <div className="competition-draw-mode-modal" onClick={(e) => e.stopPropagation()}>
            <div className="competition-params-modal-head">
              <div>
                <h3>
                  {actionMode === 'weigh' && 'Pesé'}
                  {actionMode === 'export' && 'Exporter Liste'}
                  {actionMode === 'badges' && 'Badges'}
                  {actionMode === 'draw' && 'Tirage au sort'}
                  {actionMode === 'clubs' && 'Club'}
                </h3>
                <p className="form-hint">Choisissez Individuel ou Par équipe.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActionMode(null)}>
                Fermer
              </button>
            </div>
            <div className="competition-draw-mode-actions">
              <button type="button" className="btn btn-tirage competition-draw-mode-btn" onClick={() => handleActionMode('individuel')}>
                Individuel
              </button>
              <button type="button" className="btn btn-primary competition-draw-mode-btn" onClick={() => handleActionMode('equipe')}>
                Par Equipe
              </button>
            </div>
          </div>
        </div>
      )}

      {drawAnimating && drawResult && (
        <div className="draw-animation-overlay" role="dialog" aria-modal="true" aria-label="Animation du tirage au sort">
          <DrawAnimation
            durationMs={10000}
            items={
              drawResult.mode === 'equipe'
                ? drawResult.groups.flatMap((g) => (g.matches || []).flatMap((m) => [m.clubA, m.clubB]))
                : drawResult.groups.flatMap((g) => (g.seedOrder || []).map((s) => s.label))
            }
            title={drawResult.mode === 'equipe' ? 'Tirage par équipes' : 'Tirage individuel'}
            onDone={() => setDrawAnimating(false)}
          />
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
                <button type="button" className="btn btn-outline" onClick={() => { setDrawResult(null); setActionMode('draw'); }}>
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
