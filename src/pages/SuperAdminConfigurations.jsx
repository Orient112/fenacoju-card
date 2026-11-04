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
  DEFAULT_FEDERATION_LABELS,
  DEFAULT_FEDERATION_ROLE_KEYS,
  DEFAULT_MENU_LABELS,
  FEATURE_OPTIONS,
  mergeFederationSettings,
} from '../utils/federationConfig';

const CARD_KEYS = Object.keys(DEFAULT_FEDERATION_LABELS);
const MENU_KEYS = Object.keys(DEFAULT_MENU_LABELS);

const SECTIONS = [
  { key: 'params', label: 'Paramètres' },
  { key: 'colors', label: 'Couleurs' },
  { key: 'words', label: 'Mots / libellés' },
  { key: 'menus', label: 'Menus' },
  { key: 'roles', label: 'Rôles' },
  { key: 'cards', label: 'Cases Dashboard' },
];

export default function SuperAdminConfigurations({ onToast }) {
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [federations, setFederations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [section, setSection] = useState('params');
  const [roleTab, setRoleTab] = useState('admin');
  const [form, setForm] = useState(() => mergeFederationSettings(null));

  const selected = useMemo(
    () => federations.find((f) => f.id === selectedId) || null,
    [federations, selectedId]
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
        if (!cancelled) setForm(mergeFederationSettings(data));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

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

  if (loadingList) {
    return <BrandLoader label="Chargement des configurations…" />;
  }

  return (
    <div className="sa-config-page">
      <div className="list-toolbar">
        <div>
          <h2>Configurations</h2>
          <p className="form-hint">
            Paramétrez chaque fédération : couleurs, menus, libellés, rôles et options système.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {federations.length === 0 ? (
        <div className="empty-state">
          <h3>Aucune fédération</h3>
          <p>Créez d&apos;abord une fédération pour configurer ses options.</p>
        </div>
      ) : (
        <div className="sa-config-layout">
          <aside className="sa-config-sidebar">
            <p className="sa-kicker">Fédérations</p>
            <div className="sa-config-fed-list">
              {federations.map((f) => (
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
                    <strong>{f.nom}</strong>
                    <small>{f.nom_profil || f.slug || '—'}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="sa-config-main">
            {loadingSettings ? (
              <BrandLoader label="Chargement de la configuration…" />
            ) : (
              <form onSubmit={handleSave} className="federation-settings-form">
                <div className="sa-config-selected">
                  <img
                    src={selected?.logo_url ? resolveMediaUrl(selected.logo_url) : '/fenacoju-logo.png'}
                    alt=""
                  />
                  <div>
                    <h3>{selected?.nom || 'Fédération'}</h3>
                    <p className="form-hint">{selected?.nom_profil || selected?.slug || ''}</p>
                  </div>
                </div>

                <div className="fed-role-tabs sa-config-tabs">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`btn btn-sm ${section === s.key ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setSection(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {section === 'params' && (
                  <section className="fed-settings-block">
                    <h3>Options système</h3>
                    <p className="form-hint">Activez ou désactivez les modules pour les comptes de cette fédération.</p>
                    <div className="fed-visibility-grid">
                      {FEATURE_OPTIONS.map((opt) => (
                        <label key={opt.key} className="fed-visibility-item">
                          <input
                            type="checkbox"
                            checked={form.features?.[opt.key] !== false}
                            onChange={(e) => setForm((p) => ({
                              ...p,
                              features: { ...p.features, [opt.key]: e.target.checked },
                            }))}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {section === 'colors' && (
                  <section className="fed-settings-block">
                    <h3>Couleurs d&apos;affichage</h3>
                    <div className="fed-color-grid">
                      {[
                        ['primary', 'Couleur principale / menus'],
                        ['primary_light', 'Principale claire'],
                        ['primary_dark', 'Principale foncée'],
                        ['accent', 'Accent'],
                        ['bg', 'Fond'],
                      ].map(([key, label]) => (
                        <label key={key} className="fed-color-field">
                          <span>{label}</span>
                          <div className="fed-color-row">
                            <input
                              type="color"
                              value={form.colors[key] || '#1D4393'}
                              onChange={(e) => setForm((p) => ({
                                ...p,
                                colors: { ...p.colors, [key]: e.target.value },
                              }))}
                            />
                            <input
                              type="text"
                              value={form.colors[key] || ''}
                              onChange={(e) => setForm((p) => ({
                                ...p,
                                colors: { ...p.colors, [key]: e.target.value },
                              }))}
                              pattern="^#[0-9A-Fa-f]{6}$"
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    <div
                      className="fed-color-preview"
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
                  </section>
                )}

                {section === 'words' && (
                  <section className="fed-settings-block">
                    <h3>Mots utilisés (entités)</h3>
                    <p className="form-hint">Ces libellés remplacent les noms affichés dans les listes et cases.</p>
                    <div className="form-grid">
                      {CARD_KEYS.map((key) => (
                        <div className="form-group" key={key}>
                          <label>{DEFAULT_FEDERATION_LABELS[key]}</label>
                          <input
                            value={form.labels[key] || ''}
                            onChange={(e) => setForm((p) => ({
                              ...p,
                              labels: { ...p.labels, [key]: e.target.value },
                            }))}
                            placeholder={DEFAULT_FEDERATION_LABELS[key]}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {section === 'menus' && (
                  <section className="fed-settings-block">
                    <h3>Libellés des menus</h3>
                    <div className="form-grid">
                      {MENU_KEYS.map((key) => (
                        <div className="form-group" key={key}>
                          <label>{DEFAULT_MENU_LABELS[key]}</label>
                          <input
                            value={form.menu_labels[key] || ''}
                            onChange={(e) => setForm((p) => ({
                              ...p,
                              menu_labels: { ...p.menu_labels, [key]: e.target.value },
                            }))}
                            placeholder={DEFAULT_MENU_LABELS[key]}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {section === 'roles' && (
                  <section className="fed-settings-block">
                    <h3>Rôles utilisateurs (comptes Fédération)</h3>
                    <p className="form-hint">Activez les rôles autorisés et personnalisez leurs noms affichés.</p>
                    <div className="sa-config-roles">
                      {DEFAULT_FEDERATION_ROLE_KEYS.map((key) => (
                        <div key={key} className="sa-config-role-row">
                          <label className="fed-visibility-item">
                            <input
                              type="checkbox"
                              checked={form.roles_enabled?.[key] !== false}
                              onChange={(e) => setForm((p) => ({
                                ...p,
                                roles_enabled: { ...p.roles_enabled, [key]: e.target.checked },
                              }))}
                            />
                            <span>Actif</span>
                          </label>
                          <input
                            value={form.role_labels?.[key] || key}
                            onChange={(e) => setForm((p) => ({
                              ...p,
                              role_labels: { ...p.role_labels, [key]: e.target.value },
                            }))}
                            placeholder={key}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {section === 'cards' && (
                  <section className="fed-settings-block">
                    <h3>Cases Dashboard par type de compte</h3>
                    <div className="fed-role-tabs">
                      {ACCOUNT_VISIBILITY_ROLES.map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          className={`btn btn-sm ${roleTab === r.key ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setRoleTab(r.key)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <div className="fed-visibility-grid">
                      {CARD_KEYS.map((key) => {
                        const checked = form.card_visibility?.[roleTab]?.[key] !== false;
                        return (
                          <label key={key} className="fed-visibility-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setForm((p) => ({
                                ...p,
                                card_visibility: {
                                  ...p.card_visibility,
                                  [roleTab]: {
                                    ...(p.card_visibility?.[roleTab] || {}),
                                    [key]: e.target.checked,
                                  },
                                },
                              }))}
                            />
                            <span>{form.labels[key] || DEFAULT_FEDERATION_LABELS[key]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="confirm-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy || !selectedId}>
                    {busy ? 'Enregistrement…' : 'Enregistrer la configuration'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
