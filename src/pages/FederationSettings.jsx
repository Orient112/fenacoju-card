import { useEffect, useState } from 'react';
import { fetchFederationSettings, updateFederationSettings } from '../api';
import {
  ACCOUNT_VISIBILITY_ROLES,
  DEFAULT_FEDERATION_LABELS,
  mergeFederationSettings,
} from '../utils/federationConfig';

const CARD_KEYS = Object.keys(DEFAULT_FEDERATION_LABELS);

export default function FederationSettings({ onBack, onToast, onSettingsSaved }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => mergeFederationSettings(null));
  const [roleTab, setRoleTab] = useState('admin');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchFederationSettings();
        if (!cancelled) setForm(mergeFederationSettings(data));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await updateFederationSettings(form);
      const merged = mergeFederationSettings(saved);
      setForm(merged);
      onSettingsSaved?.(merged);
      onToast?.('Paramétrage fédération enregistré');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loader">
        <div className="brand-loader" aria-hidden="true">
          <span className="brand-loader-ring" />
          <img src="/fenacoju-logo.png" alt="" className="brand-loader-logo" />
        </div>
        <p>Chargement du paramétrage…</p>
      </div>
    );
  }

  return (
    <div className="federation-settings-page">
      <div className="list-toolbar">
        <div>
          <h2>Paramétrage de la fédération</h2>
          <p className="form-hint">
            Couleurs de l&apos;interface, libellés et cases affichées sur les Dashboards des comptes associés.
          </p>
        </div>
        {onBack && (
          <button type="button" className="btn btn-outline" onClick={onBack}>
            Retour
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSave} className="federation-settings-form">
        <section className="fed-settings-block">
          <h3>Couleurs de l&apos;interface</h3>
          <div className="fed-color-grid">
            {[
              ['primary', 'Couleur principale'],
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
            <span className="fed-preview-chip primary">Principale</span>
            <span className="fed-preview-chip accent">Accent</span>
            <span className="fed-preview-chip bg">Fond</span>
          </div>
        </section>

        <section className="fed-settings-block">
          <h3>Noms des cases / onglets</h3>
          <p className="form-hint">Ces libellés s&apos;appliquent à tous les comptes de la fédération.</p>
          <div className="form-grid">
            {CARD_KEYS.map((key) => (
              <div className="form-group" key={key}>
                <label>{DEFAULT_FEDERATION_LABELS[key]} (clé&nbsp;: {key})</label>
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

        <section className="fed-settings-block">
          <h3>Affichage des cases Dashboard par type de compte</h3>
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

        <section className="fed-settings-block fed-settings-hint">
          <h3>Comptes de la fédération</h3>
          <p className="form-hint">
            La création et la gestion des comptes (Fédération, Ligues, Ententes, Clubs, etc.)
            se font via le bouton <strong>Créer</strong> et les listes du Dashboard.
          </p>
        </section>

        <div className="confirm-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le paramétrage'}
          </button>
        </div>
      </form>
    </div>
  );
}
