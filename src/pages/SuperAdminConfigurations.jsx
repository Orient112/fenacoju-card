import { useEffect, useMemo, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import {
  fetchFederations,
  fetchFederationSettingsById,
  resolveMediaUrl,
  updateFederationSettingsById,
} from '../api';
import {
  ACCOUNT_VISIBILITY_ROLES,
  COLOR_FIELD_META,
  DEFAULT_FEDERATION_COLORS,
  DEFAULT_FEDERATION_LABELS,
  DEFAULT_MENU_LABELS,
  ROLE_BASE_OPTIONS,
  mergeFederationSettings,
  slugifyKey,
} from '../utils/federationConfig';

const SECTIONS = [
  { key: 'params', label: 'Paramètres', hint: 'Modules et options système' },
  { key: 'colors', label: 'Couleurs', hint: 'Palette d’affichage' },
  { key: 'words', label: 'Mots', hint: 'Libellés des entités' },
  { key: 'menus', label: 'Menus', hint: 'Textes de navigation' },
  { key: 'roles', label: 'Rôles', hint: 'Fonctions des comptes' },
  { key: 'cards', label: 'Cases', hint: 'Visibilité Dashboard' },
];

const SYSTEM_LABEL_KEYS = new Set(Object.keys(DEFAULT_FEDERATION_LABELS));
const SYSTEM_MENU_KEYS = new Set(Object.keys(DEFAULT_MENU_LABELS));
const SYSTEM_COLOR_KEYS = new Set(Object.keys(DEFAULT_FEDERATION_COLORS));

function ItemModal({
  open,
  title,
  fields,
  values,
  onChange,
  onClose,
  onSubmit,
  submitLabel = 'Enregistrer',
}) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sa-config-modal" onClick={(e) => e.stopPropagation()}>
        <header className="sa-config-modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>Fermer</button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="sa-config-modal-body">
            {fields.map((field) => (
              <div className="form-group" key={field.name}>
                <label>{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    value={values[field.name] ?? ''}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    required={field.required}
                    disabled={field.disabled}
                  >
                    {(field.options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === 'checkbox' ? (
                  <label className="fed-visibility-item">
                    <input
                      type="checkbox"
                      checked={!!values[field.name]}
                      onChange={(e) => onChange(field.name, e.target.checked)}
                      disabled={field.disabled}
                    />
                    <span>{field.checkLabel || 'Actif'}</span>
                  </label>
                ) : field.type === 'color' ? (
                  <div className="fed-color-row">
                    <input
                      type="color"
                      value={values[field.name] || '#1D4393'}
                      onChange={(e) => onChange(field.name, e.target.value)}
                    />
                    <input
                      type="text"
                      value={values[field.name] || ''}
                      onChange={(e) => onChange(field.name, e.target.value)}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      required={field.required}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={values[field.name] ?? ''}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    disabled={field.disabled}
                    maxLength={field.maxLength || 60}
                  />
                )}
                {field.hint && <p className="form-hint">{field.hint}</p>}
              </div>
            ))}
          </div>
          <div className="sa-config-modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminConfigurations({ onToast }) {
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [federations, setFederations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [section, setSection] = useState('roles');
  const [roleTab, setRoleTab] = useState('admin');
  const [federationMemberRole, setFederationMemberRole] = useState('');
  const [form, setForm] = useState(() => mergeFederationSettings(null));
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState({});

  const cardsVisibilityKey = roleTab === 'federation' && federationMemberRole
    ? `federation:${federationMemberRole}`
    : roleTab;

  const selected = useMemo(
    () => federations.find((f) => f.id === selectedId) || null,
    [federations, selectedId]
  );

  const filteredFeds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return federations;
    return federations.filter((f) =>
      [f.nom, f.nom_profil, f.slug].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [federations, query]);

  const labelEntries = useMemo(
    () => Object.entries(form.labels || {}).map(([key, label]) => ({
      key,
      label,
      system: SYSTEM_LABEL_KEYS.has(key),
    })),
    [form.labels]
  );

  const menuEntries = useMemo(
    () => Object.entries(form.menu_labels || {}).map(([key, label]) => ({
      key,
      label,
      system: SYSTEM_MENU_KEYS.has(key),
    })),
    [form.menu_labels]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError('');
      try {
        const data = await fetchFederations();
        if (cancelled) return;
        const list = data.federations || [];
        setFederations(list);
        if (list[0]?.id) setSelectedId(list[0].id);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingSettings(true);
      setError('');
      try {
        const data = await fetchFederationSettingsById(selectedId);
        if (!cancelled) {
          const merged = mergeFederationSettings(data);
          setForm(merged);
          const firstRole = (merged.roles || []).find((r) => r.enabled !== false)?.key
            || merged.roles?.[0]?.key
            || '';
          setFederationMemberRole(firstRole);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const openModal = (type, mode, item = null) => {
    setModal({ type, mode, item });
    if (type === 'role') {
      setDraft({
        key: item?.key || '',
        label: item?.label || '',
        enabled: item?.enabled !== false,
        base: item?.base || 'Membre',
        system: !!item?.system,
      });
    } else if (type === 'feature') {
      setDraft({
        key: item?.key || '',
        label: item?.label || '',
        enabled: form.features?.[item?.key] !== false,
        system: !!item?.system,
      });
    } else if (type === 'color') {
      setDraft({
        key: item?.key || '',
        label: item?.label || COLOR_FIELD_META[item?.key] || '',
        value: form.colors?.[item?.key] || '#1D4393',
        system: !!item?.system,
      });
    } else if (type === 'word' || type === 'menu') {
      setDraft({
        key: item?.key || '',
        label: item?.label || '',
        system: !!item?.system,
      });
    }
  };

  const closeModal = () => {
    setModal(null);
    setDraft({});
  };

  const handleModalSave = () => {
    if (!modal) return;
    const { type, mode, item } = modal;

    if (type === 'role') {
      const label = String(draft.label || '').trim();
      if (!label) return;
      const key = mode === 'edit' ? item.key : (String(draft.key || label).trim() || label);
      setForm((prev) => {
        const roles = [...(prev.roles || [])];
        if (mode === 'edit') {
          const idx = roles.findIndex((r) => r.key === item.key);
          if (idx >= 0) {
            roles[idx] = {
              ...roles[idx],
              label,
              enabled: draft.enabled !== false,
              base: draft.base || roles[idx].base || 'Membre',
            };
          }
        } else {
          if (roles.some((r) => r.key === key)) {
            setError('Ce rôle existe déjà pour cette fédération');
            return prev;
          }
          roles.push({
            key,
            label,
            enabled: draft.enabled !== false,
            system: false,
            base: draft.base || 'Membre',
            order: roles.length,
          });
        }
        return mergeFederationSettings({ ...prev, roles });
      });
    }

    if (type === 'feature') {
      const label = String(draft.label || '').trim();
      if (!label) return;
      const key = mode === 'edit' ? item.key : slugifyKey(draft.key || label, 'option');
      setForm((prev) => {
        let feature_defs = [...(prev.feature_defs || [])];
        const features = { ...prev.features };
        if (mode === 'edit') {
          feature_defs = feature_defs.map((f) => (f.key === item.key ? { ...f, label } : f));
          features[item.key] = draft.enabled !== false;
        } else {
          if (feature_defs.some((f) => f.key === key)) {
            setError('Cette option existe déjà');
            return prev;
          }
          feature_defs.push({ key, label, system: false, order: feature_defs.length });
          features[key] = draft.enabled !== false;
        }
        return mergeFederationSettings({ ...prev, feature_defs, features });
      });
    }

    if (type === 'color') {
      const label = String(draft.label || '').trim();
      const value = String(draft.value || '').trim();
      if (!label || !/^#[0-9A-Fa-f]{6}$/.test(value)) return;
      const key = mode === 'edit' ? item.key : slugifyKey(draft.key || label, 'color');
      setForm((prev) => {
        const colors = { ...prev.colors };
        let color_defs = [...(prev.color_defs || [])];
        if (mode === 'edit') {
          colors[item.key] = value;
          color_defs = color_defs.map((c) => (c.key === item.key ? { ...c, label } : c));
        } else {
          if (colors[key]) {
            setError('Cette couleur existe déjà');
            return prev;
          }
          colors[key] = value;
          color_defs.push({ key, label, system: false, order: color_defs.length });
        }
        return mergeFederationSettings({ ...prev, colors, color_defs });
      });
    }

    if (type === 'word') {
      const label = String(draft.label || '').trim();
      if (!label) return;
      const key = mode === 'edit' ? item.key : slugifyKey(draft.key || label, 'entite');
      setForm((prev) => {
        const labels = { ...prev.labels };
        if (mode === 'edit') labels[item.key] = label;
        else {
          if (labels[key]) {
            setError('Ce libellé existe déjà');
            return prev;
          }
          labels[key] = label;
        }
        return mergeFederationSettings({ ...prev, labels });
      });
    }

    if (type === 'menu') {
      const label = String(draft.label || '').trim();
      if (!label) return;
      const key = mode === 'edit' ? item.key : slugifyKey(draft.key || label, 'menu');
      setForm((prev) => {
        const menu_labels = { ...prev.menu_labels };
        if (mode === 'edit') menu_labels[item.key] = label;
        else {
          if (menu_labels[key]) {
            setError('Ce menu existe déjà');
            return prev;
          }
          menu_labels[key] = label;
        }
        return mergeFederationSettings({ ...prev, menu_labels });
      });
    }

    setError('');
    closeModal();
  };

  const handleDelete = (type, item) => {
    if (item.system && type !== 'role') {
      onToast?.('Élément système : suppression non autorisée', 'error');
      return;
    }
    if (type === 'role' && item.key === 'Coordon') {
      onToast?.('Le rôle Coordon ne peut pas être supprimé', 'error');
      return;
    }
    const ok = window.confirm(`Supprimer « ${item.label || item.key} » pour cette fédération ?`);
    if (!ok) return;

    setForm((prev) => {
      if (type === 'role') {
        return mergeFederationSettings({
          ...prev,
          roles: (prev.roles || []).filter((r) => r.key !== item.key),
        });
      }
      if (type === 'feature') {
        const feature_defs = (prev.feature_defs || []).filter((f) => f.key !== item.key);
        const features = { ...prev.features };
        delete features[item.key];
        return mergeFederationSettings({ ...prev, feature_defs, features });
      }
      if (type === 'color') {
        if (SYSTEM_COLOR_KEYS.has(item.key)) {
          onToast?.('Couleur système : suppression non autorisée', 'error');
          return prev;
        }
        const colors = { ...prev.colors };
        delete colors[item.key];
        const color_defs = (prev.color_defs || []).filter((c) => c.key !== item.key);
        return mergeFederationSettings({ ...prev, colors, color_defs });
      }
      if (type === 'word') {
        const labels = { ...prev.labels };
        delete labels[item.key];
        if (!Object.keys(labels).length) {
          onToast?.('Conservez au moins un libellé', 'error');
          return prev;
        }
        return mergeFederationSettings({ ...prev, labels });
      }
      if (type === 'menu') {
        if (SYSTEM_MENU_KEYS.has(item.key)) {
          onToast?.('Menu système : suppression non autorisée', 'error');
          return prev;
        }
        const menu_labels = { ...prev.menu_labels };
        delete menu_labels[item.key];
        return mergeFederationSettings({ ...prev, menu_labels });
      }
      return prev;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const saved = await updateFederationSettingsById(selectedId, form);
      setForm(mergeFederationSettings(saved));
      onToast?.(`Configuration enregistrée : ${selected?.nom || 'fédération'}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sectionMeta = SECTIONS.find((s) => s.key === section);

  const modalFields = (() => {
    if (!modal) return [];
    if (modal.type === 'role') {
      return [
        {
          name: 'label',
          label: 'Nom affiché',
          required: true,
          placeholder: 'Ex. Président',
        },
        ...(modal.mode === 'add' ? [{
          name: 'key',
          label: 'Identifiant technique',
          placeholder: 'Laisser vide = utiliser le nom',
          hint: 'Conservé dans les comptes (fonction).',
        }] : []),
        {
          name: 'base',
          label: 'Permissions de base',
          type: 'select',
          options: ROLE_BASE_OPTIONS.map((v) => ({ value: v, label: v })),
          hint: 'Les droits du nouveau rôle reprennent ce modèle.',
          disabled: modal.mode === 'edit' && modal.item?.system,
        },
        {
          name: 'enabled',
          label: 'Statut',
          type: 'checkbox',
          checkLabel: 'Rôle actif (disponible à la création)',
        },
      ];
    }
    if (modal.type === 'feature') {
      return [
        { name: 'label', label: 'Libellé', required: true },
        ...(modal.mode === 'add' ? [{ name: 'key', label: 'Clé technique', placeholder: 'auto si vide' }] : []),
        { name: 'enabled', label: 'Statut', type: 'checkbox', checkLabel: 'Option activée' },
      ];
    }
    if (modal.type === 'color') {
      return [
        { name: 'label', label: 'Nom', required: true },
        ...(modal.mode === 'add' ? [{ name: 'key', label: 'Clé CSS', placeholder: 'ex. highlight' }] : []),
        { name: 'value', label: 'Couleur', type: 'color', required: true },
      ];
    }
    if (modal.type === 'word' || modal.type === 'menu') {
      return [
        { name: 'label', label: 'Libellé affiché', required: true },
        ...(modal.mode === 'add' ? [{
          name: 'key',
          label: 'Clé',
          placeholder: 'auto si vide',
          disabled: modal.mode === 'edit' && modal.item?.system,
        }] : []),
      ];
    }
    return [];
  })();

  if (loadingList) {
    return <BrandLoader label="Chargement des configurations…" />;
  }

  return (
    <div className="sa-config-page">
      <header className="sa-config-hero">
        <div>
          <p className="sa-kicker">Console SuperAdmin</p>
          <h2>Configurations</h2>
          <p className="sa-config-hero-text">
            Gérez séparément paramètres, couleurs, mots, menus, rôles et cases Dashboard de chaque fédération.
          </p>
        </div>
        {selected && (
          <div className="sa-config-hero-fed sa-config-hero-fed-logo-only" title={selected.nom}>
            <img
              src={selected.logo_url ? resolveMediaUrl(selected.logo_url) : '/fenacoju-logo.png'}
              alt={selected.nom || 'Fédération'}
            />
          </div>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {federations.length === 0 ? (
        <div className="empty-state">
          <h3>Aucune fédération</h3>
          <p>Créez d&apos;abord une fédération pour configurer ses options.</p>
        </div>
      ) : (
        <div className="sa-config-layout">
          <aside className="sa-config-sidebar">
            <div className="sa-config-side-head">
              <p className="sa-kicker">Fédérations</p>
              <input
                className="sa-config-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
              />
            </div>
            <div className="sa-config-fed-list">
              {filteredFeds.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`sa-config-fed-item ${selectedId === f.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(f.id)}
                >
                  <img
                    src={f.logo_url ? resolveMediaUrl(f.logo_url) : '/fenacoju-logo.png'}
                    alt=""
                  />
                  <span>
                    <strong>{f.nom_profil || f.slug || f.nom}</strong>
                    <small>{f.nom}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="sa-config-main">
            {loadingSettings ? (
              <BrandLoader label="Chargement de la configuration…" />
            ) : (
              <form onSubmit={handleSave} className="sa-config-panel">
                <nav className="sa-config-section-nav" aria-label="Sections configuration">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`sa-config-section-btn ${section === s.key ? 'is-active' : ''}`}
                      onClick={() => setSection(s.key)}
                    >
                      <strong>{s.label}</strong>
                      <small>{s.hint}</small>
                    </button>
                  ))}
                </nav>

                <div className="sa-config-toolbar">
                  <div>
                    <h3>{sectionMeta?.label}</h3>
                    <p className="form-hint">{sectionMeta?.hint} — Ajouter, modifier ou supprimer par fédération.</p>
                  </div>
                  {section !== 'cards' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openModal(
                        section === 'params' ? 'feature'
                          : section === 'colors' ? 'color'
                            : section === 'words' ? 'word'
                              : section === 'menus' ? 'menu'
                                : 'role',
                        'add'
                      )}
                    >
                      Ajouter
                    </button>
                  )}
                </div>

                {section === 'params' && (
                  <div className="sa-config-table-wrap">
                    <table className="sa-config-table">
                      <thead>
                        <tr>
                          <th>Option</th>
                          <th>État</th>
                          <th>Type</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(form.feature_defs || []).map((item) => (
                          <tr key={item.key}>
                            <td>
                              <strong>{item.label}</strong>
                              <small>{item.key}</small>
                            </td>
                            <td>
                              <span className={`sa-config-badge ${form.features?.[item.key] !== false ? 'is-on' : 'is-off'}`}>
                                {form.features?.[item.key] !== false ? 'Activé' : 'Désactivé'}
                              </span>
                            </td>
                            <td>{item.system ? 'Système' : 'Personnalisé'}</td>
                            <td className="sa-config-actions">
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => openModal('feature', 'edit', item)}>Modifier</button>
                              {!item.system && (
                                <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleDelete('feature', item)}>Supprimer</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section === 'colors' && (
                  <div className="sa-config-table-wrap">
                    <div
                      className="sa-config-color-preview"
                      style={{
                        '--preview-primary': form.colors.primary,
                        '--preview-accent': form.colors.accent,
                        '--preview-bg': form.colors.bg,
                      }}
                    >
                      <span className="fed-preview-chip primary">Menus</span>
                      <span className="fed-preview-chip accent">Accent</span>
                      <span className="fed-preview-chip bg">Fond</span>
                    </div>
                    <table className="sa-config-table">
                      <thead>
                        <tr>
                          <th>Couleur</th>
                          <th>Valeur</th>
                          <th>Type</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(form.color_defs || []).map((item) => (
                          <tr key={item.key}>
                            <td>
                              <strong>{item.label}</strong>
                              <small>{item.key}</small>
                            </td>
                            <td>
                              <span className="sa-config-swatch" style={{ background: form.colors[item.key] }} />
                              {form.colors[item.key]}
                            </td>
                            <td>{item.system ? 'Système' : 'Personnalisé'}</td>
                            <td className="sa-config-actions">
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => openModal('color', 'edit', item)}>Modifier</button>
                              {!item.system && (
                                <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleDelete('color', item)}>Supprimer</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section === 'words' && (
                  <div className="sa-config-table-wrap">
                    <table className="sa-config-table">
                      <thead>
                        <tr>
                          <th>Clé</th>
                          <th>Libellé</th>
                          <th>Type</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {labelEntries.map((item) => (
                          <tr key={item.key}>
                            <td><code>{item.key}</code></td>
                            <td><strong>{item.label}</strong></td>
                            <td>{item.system ? 'Système' : 'Personnalisé'}</td>
                            <td className="sa-config-actions">
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => openModal('word', 'edit', item)}>Modifier</button>
                              <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleDelete('word', item)}>Supprimer</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section === 'menus' && (
                  <div className="sa-config-table-wrap">
                    <table className="sa-config-table">
                      <thead>
                        <tr>
                          <th>Clé</th>
                          <th>Texte menu</th>
                          <th>Type</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {menuEntries.map((item) => (
                          <tr key={item.key}>
                            <td><code>{item.key}</code></td>
                            <td><strong>{item.label}</strong></td>
                            <td>{item.system ? 'Système' : 'Personnalisé'}</td>
                            <td className="sa-config-actions">
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => openModal('menu', 'edit', item)}>Modifier</button>
                              {!item.system && (
                                <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleDelete('menu', item)}>Supprimer</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section === 'roles' && (
                  <div className="sa-config-table-wrap">
                    <table className="sa-config-table">
                      <thead>
                        <tr>
                          <th>Rôle</th>
                          <th>Base droits</th>
                          <th>État</th>
                          <th>Type</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(form.roles || []).map((item) => (
                          <tr key={item.key}>
                            <td>
                              <strong>{item.label}</strong>
                              <small>{item.key}</small>
                            </td>
                            <td>{item.base || item.key}</td>
                            <td>
                              <span className={`sa-config-badge ${item.enabled !== false ? 'is-on' : 'is-off'}`}>
                                {item.enabled !== false ? 'Actif' : 'Inactif'}
                              </span>
                            </td>
                            <td>{item.system ? 'Système' : 'Personnalisé'}</td>
                            <td className="sa-config-actions">
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => openModal('role', 'edit', item)}>Modifier</button>
                              {item.key !== 'Coordon' && (
                                <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleDelete('role', item)}>Supprimer</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section === 'cards' && (
                  <section className="sa-config-cards">
                    <div className="fed-role-tabs">
                      {ACCOUNT_VISIBILITY_ROLES.map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          className={`btn btn-sm ${roleTab === r.key ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => {
                            setRoleTab(r.key);
                            if (r.key === 'federation' && !federationMemberRole) {
                              setFederationMemberRole(form.roles?.[0]?.key || '');
                            }
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {roleTab === 'federation' && (
                      <div className="sa-config-member-roles">
                        <p className="form-hint">Choisissez le compte membre, puis cochez ses cases Dashboard.</p>
                        <div className="fed-role-tabs">
                          {(form.roles || []).map((r) => (
                            <button
                              key={r.key}
                              type="button"
                              className={`btn btn-sm ${federationMemberRole === r.key ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => setFederationMemberRole(r.key)}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="fed-visibility-grid">
                      {Object.keys(form.labels || {}).map((key) => {
                        const checked = form.card_visibility?.[cardsVisibilityKey]?.[key] !== false;
                        return (
                          <label key={key} className="fed-visibility-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setForm((p) => ({
                                ...p,
                                card_visibility: {
                                  ...p.card_visibility,
                                  [cardsVisibilityKey]: {
                                    ...(p.card_visibility?.[cardsVisibilityKey] || {}),
                                    [key]: e.target.checked,
                                  },
                                },
                              }))}
                            />
                            <span>{form.labels[key] || key}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="form-hint">
                      Pour ajouter / supprimer une case, gérez d&apos;abord les libellés dans l&apos;onglet Mots.
                    </p>
                  </section>
                )}

                <div className="sa-config-savebar sa-config-savebar-end">
                  <button type="submit" className="btn btn-primary" disabled={busy || !selectedId}>
                    {busy ? 'Enregistrement…' : 'Enregistrer la configuration'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <ItemModal
        open={!!modal}
        title={
          modal
            ? `${modal.mode === 'add' ? 'Ajouter' : 'Modifier'} — ${
              modal.type === 'role' ? 'rôle'
                : modal.type === 'feature' ? 'paramètre'
                  : modal.type === 'color' ? 'couleur'
                    : modal.type === 'word' ? 'mot'
                      : 'menu'
            }`
            : ''
        }
        fields={modalFields}
        values={draft}
        onChange={(name, value) => setDraft((p) => ({ ...p, [name]: value }))}
        onClose={closeModal}
        onSubmit={handleModalSave}
        submitLabel={modal?.mode === 'add' ? 'Ajouter' : 'Modifier'}
      />
    </div>
  );
}
