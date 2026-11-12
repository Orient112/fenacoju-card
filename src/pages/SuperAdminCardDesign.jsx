import { useEffect, useMemo, useRef, useState } from 'react';
import BrandLoader from '../components/BrandLoader';
import JudokaCard from '../components/JudokaCard';
import {
  fetchFederations,
  fetchFederationSettingsById,
  resolveMediaUrl,
  updateFederationSettingsById,
} from '../api';
import {
  getDefaultCardDesign,
  mergeFederationSettings,
  normalizeCardDesign,
} from '../utils/federationConfig';
import {
  buildPreviewCardNumber,
  deriveCardIdPrefix,
  extractDesignFromJpg,
  generateCardDesignForFederation,
} from '../utils/cardDesignTools';

const COLOR_FIELDS = [
  { key: 'header_bg', label: 'Fond en-tête' },
  { key: 'accent_start', label: 'Accent début' },
  { key: 'accent_mid', label: 'Accent milieu' },
  { key: 'accent_end', label: 'Accent fin' },
  { key: 'name', label: 'Couleur du nom' },
  { key: 'label', label: 'Couleur des labels' },
  { key: 'photo_border', label: 'Bordure photo' },
];

const FIELD_TOGGLES = [
  { key: 'club', label: 'Club' },
  { key: 'grade', label: 'Grade' },
  { key: 'categorie', label: 'Catégorie (si renseignée)' },
  { key: 'numero_licence', label: 'Licence (si renseignée)' },
];

export default function SuperAdminCardDesign({ onToast }) {
  const importInputRef = useRef(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [federations, setFederations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [settings, setSettings] = useState(() => mergeFederationSettings(null));
  const [design, setDesign] = useState(() => getDefaultCardDesign());
  const [generateSeed, setGenerateSeed] = useState(0);

  const selected = useMemo(
    () => federations.find((f) => f.id === selectedId) || null,
    [federations, selectedId]
  );

  const filteredFeds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return federations;
    return federations.filter((f) =>
      String(f.nom_profil || '').toLowerCase().includes(q)
    );
  }, [federations, query]);

  const branding = useMemo(() => ({
    nom: selected?.nom || '',
    logo_url: selected?.logo_url || '',
  }), [selected]);

  const previewJudoka = useMemo(() => {
    const prefix = design.card_id_prefix || deriveCardIdPrefix(selected);
    return {
      id: 'preview-card-design',
      prenom: 'Jean',
      nom: 'Mbala',
      club: 'Club Kinshasa Judo',
      grade: 'Ceinture Noire 1er Dan',
      categorie: '-73 kg',
      numero_licence: 'LIC-2026-001',
      numero_carte: buildPreviewCardNumber(prefix),
      photo: '',
      date_inscription: new Date().toISOString(),
      hierarchy_id: 'L01-E01-C01',
    };
  }, [design.card_id_prefix, selected]);

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
        if (!cancelled) setError(err.message || 'Chargement impossible');
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
        if (cancelled) return;
        const merged = mergeFederationSettings(data);
        const fed = federations.find((f) => f.id === selectedId);
        const nextDesign = normalizeCardDesign({
          ...(merged.card_design || {}),
          card_id_prefix: merged.card_design?.card_id_prefix || deriveCardIdPrefix(fed),
        });
        setSettings(merged);
        setDesign(nextDesign);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Chargement du design impossible');
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, federations]);

  const updateDesign = (patch) => {
    setDesign((prev) => normalizeCardDesign({ ...prev, ...patch }));
  };

  const updateColor = (key, value) => {
    setDesign((prev) => normalizeCardDesign({
      ...prev,
      colors: { ...(prev.colors || {}), [key]: value },
    }));
  };

  const updateField = (key, checked) => {
    setDesign((prev) => normalizeCardDesign({
      ...prev,
      fields: { ...(prev.fields || {}), [key]: checked },
    }));
  };

  const handleReset = () => {
    const defaults = getDefaultCardDesign();
    setDesign(normalizeCardDesign({
      ...defaults,
      card_id_prefix: deriveCardIdPrefix(selected) || defaults.card_id_prefix,
      org_name: selected?.nom || defaults.org_name,
    }));
  };

  const handleGenerate = () => {
    const seed = Date.now() + generateSeed + 1;
    setGenerateSeed((n) => n + 1);
    const next = generateCardDesignForFederation(selected, design, seed);
    setDesign(next);
    onToast?.('Nouveau modèle généré - enregistrez pour l\'appliquer', 'success');
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportBusy(true);
    setError('');
    try {
      const next = await extractDesignFromJpg(file, {
        federation: selected,
        current: design,
      });
      setDesign(next);
      onToast?.('Design JPG importé - couleurs et intitulés mis à jour', 'success');
    } catch (err) {
      const msg = err.message || 'Import JPG impossible';
      setError(msg);
      onToast?.(msg, 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...settings,
        card_design: normalizeCardDesign({
          ...design,
          card_id_prefix: design.card_id_prefix || deriveCardIdPrefix(selected),
        }),
      };
      const saved = await updateFederationSettingsById(selectedId, payload);
      const merged = mergeFederationSettings(saved);
      setSettings(merged);
      setDesign(normalizeCardDesign(merged.card_design || {}));
      onToast?.('Design de carte enregistré', 'success');
    } catch (err) {
      const msg = err.message || 'Enregistrement impossible';
      setError(msg);
      onToast?.(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loadingList) {
    return <BrandLoader label="Chargement des fédérations…" />;
  }

  return (
    <div className="sa-config-page sa-card-design-page">
      <header className="sa-config-hero">
        <div>
          <p className="sa-kicker">Console SuperAdmin</p>
          <h2>Design Cartes</h2>
          <p className="sa-config-hero-text">
            Modèle de carte athlète par fédération. Les athlètes voient le design de leur fédération.
          </p>
        </div>
        {selected && (
          <div className="sa-config-hero-fed sa-config-hero-fed-logo-only" title={selected.nom_profil || selected.nom}>
            <img
              src={selected.logo_url ? resolveMediaUrl(selected.logo_url) : '/fenacoju-logo.png'}
              alt=""
            />
          </div>
        )}
      </header>

      {error ? <div className="form-error">{error}</div> : null}

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
                  <strong>{f.nom_profil || 'Sans nom de profil'}</strong>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="sa-config-main">
          {!selectedId ? (
            <p className="form-hint">Sélectionnez une fédération.</p>
          ) : loadingSettings ? (
            <BrandLoader label="Chargement du design…" />
          ) : (
            <div className="sa-card-design-grid">
              <div className="sa-card-design-preview-panel">
                <div className="sa-card-design-preview-head">
                  <h3>Aperçu live</h3>
                  <p className="form-hint">
                    Format 85 × 55 mm - ID {previewJudoka.numero_carte}
                  </p>
                </div>
                <div className="sa-card-design-preview-stage">
                  <JudokaCard
                    judoka={previewJudoka}
                    design={design}
                    branding={branding}
                  />
                </div>
                <div className="sa-card-design-preview-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleGenerate}
                    disabled={busy || importBusy}
                  >
                    Générer
                  </button>
                </div>
              </div>

              <div className="sa-card-design-form">
                <div className="sa-card-design-actions">
                  <button type="button" className="btn btn-outline" onClick={handleReset} disabled={busy || importBusy}>
                    Réinitialiser (Judo)
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".jpg,.jpeg,image/jpeg"
                    hidden
                    onChange={handleImportFile}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleImportClick}
                    disabled={busy || importBusy}
                  >
                    {importBusy ? 'Import…' : 'Import'}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy || importBusy}>
                    {busy ? 'Enregistrement…' : 'Enregistrer le design'}
                  </button>
                </div>

                <div className="sa-card-design-block">
                  <h4>Identité</h4>
                  <div className="form-group">
                    <label htmlFor="card-org-name">Nom sur la carte</label>
                    <input
                      id="card-org-name"
                      type="text"
                      value={design.org_name}
                      onChange={(e) => updateDesign({ org_name: e.target.value })}
                      maxLength={120}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="card-subtitle">Sous-titre</label>
                    <input
                      id="card-subtitle"
                      type="text"
                      value={design.subtitle}
                      onChange={(e) => updateDesign({ subtitle: e.target.value })}
                      placeholder="Carte Athlète {year}"
                      maxLength={80}
                    />
                    <p className="form-hint">Utilisez {'{year}'} pour l&apos;année en cours.</p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="card-id-prefix">Préfixe ID carte</label>
                    <input
                      id="card-id-prefix"
                      type="text"
                      value={design.card_id_prefix || ''}
                      onChange={(e) => updateDesign({
                        card_id_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
                      })}
                      placeholder="FCJ"
                      maxLength={5}
                    />
                    <p className="form-hint">
                      Format : {design.card_id_prefix || 'FCJ'}-{new Date().getFullYear()}-0001 - unique par fédération.
                    </p>
                  </div>
                </div>

                <div className="sa-card-design-block">
                  <h4>Logo</h4>
                  <div className="form-group">
                    <label htmlFor="card-logo-mode">Source du logo</label>
                    <select
                      id="card-logo-mode"
                      value={design.logo_mode}
                      onChange={(e) => updateDesign({ logo_mode: e.target.value })}
                    >
                      <option value="default">Logo Judo par défaut</option>
                      <option value="federation">Logo de la fédération</option>
                      <option value="custom">URL personnalisée</option>
                    </select>
                  </div>
                  {design.logo_mode === 'custom' && (
                    <div className="form-group">
                      <label htmlFor="card-logo-url">URL du logo</label>
                      <input
                        id="card-logo-url"
                        type="text"
                        value={design.logo_url}
                        onChange={(e) => updateDesign({ logo_url: e.target.value })}
                        placeholder="/fenacoju-icon.png ou URL"
                        maxLength={500}
                      />
                    </div>
                  )}
                </div>

                <div className="sa-card-design-block">
                  <h4>Couleurs</h4>
                  <div className="sa-card-design-colors">
                    {COLOR_FIELDS.map((field) => (
                      <label key={field.key} className="sa-card-design-color-item">
                        <span>{field.label}</span>
                        <div className="fed-color-row">
                          <input
                            type="color"
                            value={design.colors?.[field.key] || '#1D4393'}
                            onChange={(e) => updateColor(field.key, e.target.value)}
                          />
                          <input
                            type="text"
                            value={design.colors?.[field.key] || ''}
                            onChange={(e) => updateColor(field.key, e.target.value)}
                            pattern="^#[0-9A-Fa-f]{6}$"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sa-card-design-block">
                  <h4>Champs affichés</h4>
                  <div className="sa-card-design-toggles">
                    {FIELD_TOGGLES.map((field) => (
                      <label key={field.key} className="fed-visibility-item">
                        <input
                          type="checkbox"
                          checked={design.fields?.[field.key] !== false}
                          onChange={(e) => updateField(field.key, e.target.checked)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                    <label className="fed-visibility-item">
                      <input
                        type="checkbox"
                        checked={design.show_validity !== false}
                        onChange={(e) => updateDesign({ show_validity: e.target.checked })}
                      />
                      <span>Afficher la validité</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
