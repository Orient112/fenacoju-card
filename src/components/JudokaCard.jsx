import QRCode from 'react-qr-code';
import { getCardValidityYear, resolveMediaUrl } from '../api';
import { normalizeCardDesign } from '../utils/federationConfig';

function resolveCardLogo(design, branding) {
  if (design.logo_mode === 'custom' && design.logo_url) {
    return resolveMediaUrl(design.logo_url);
  }
  if (design.logo_mode === 'federation' && branding?.logo_url) {
    return resolveMediaUrl(branding.logo_url);
  }
  return '/fenacoju-icon.png';
}

function formatSubtitle(template, year) {
  return String(template || 'Carte Athlète {year}').replace(/\{year\}/gi, String(year));
}

/** QR orienté athlète : infos judoka, pas le nom de fédération. */
function getCardQrValue(judoka) {
  return JSON.stringify({
    type: 'athlete',
    id: judoka.id,
    carte: judoka.numero_carte,
    prenom: judoka.prenom || '',
    nom: judoka.nom || '',
    club: judoka.club || '',
    grade: judoka.grade || '',
    structure: judoka.hierarchy_id || judoka.club_code || '',
  });
}

function PhotoBlock({ judoka }) {
  if (judoka.photo) {
    return (
      <img
        src={resolveMediaUrl(judoka.photo)}
        alt=""
        className="card-photo"
        crossOrigin="anonymous"
      />
    );
  }
  return (
    <div className="card-photo-placeholder">
      <span>Photo</span>
    </div>
  );
}

function DetailsGrid({ judoka, fields }) {
  return (
    <div className="card-details-grid">
      {fields.club !== false && (
        <div className="card-detail">
          <span className="card-label">Club</span>
          <span className="card-value">{judoka.club || '-'}</span>
        </div>
      )}
      {fields.grade !== false && (
        <div className="card-detail">
          <span className="card-label">Grade</span>
          <span className="card-value">{judoka.grade || '-'}</span>
        </div>
      )}
      {fields.categorie !== false && judoka.categorie && (
        <div className="card-detail">
          <span className="card-label">Catégorie</span>
          <span className="card-value">{judoka.categorie}</span>
        </div>
      )}
      {fields.numero_licence !== false && judoka.numero_licence && (
        <div className="card-detail">
          <span className="card-label">Licence</span>
          <span className="card-value">{judoka.numero_licence}</span>
        </div>
      )}
    </div>
  );
}

function QrBlock({ judoka, qrValue }) {
  return (
    <div className="card-qr" aria-label={`QR Code carte ${judoka.numero_carte}`}>
      <QRCode value={qrValue} size={200} level="L" bgColor="#ffffff" fgColor="#000000" />
    </div>
  );
}

export default function JudokaCard({ judoka, design: designProp = null, branding = null }) {
  const design = normalizeCardDesign(designProp || {});
  const validityYear = getCardValidityYear(judoka);
  const currentYear = new Date().getFullYear();
  const qrValue = getCardQrValue(judoka);
  const logoSrc = resolveCardLogo(design, branding);
  const orgName = design.org_name || branding?.nom || 'Fédération';
  const subtitle = formatSubtitle(design.subtitle, currentYear);
  const fields = design.fields || {};
  const colors = design.colors || {};
  const layout = design.layout || 'classic';

  const styleVars = {
    '--card-header-bg': colors.header_bg,
    '--card-accent-gradient': `linear-gradient(90deg, ${colors.accent_start} 0%, ${colors.accent_mid} 45%, ${colors.accent_end} 100%)`,
    '--card-name-color': colors.name,
    '--card-label-color': colors.label,
    '--card-photo-border': colors.photo_border,
  };

  const footer = (
    <div className="card-footer-zone">
      <div className="card-footer-bar">
        <span className="card-number">{judoka.numero_carte}</span>
        {design.show_validity !== false ? (
          <span className="card-inscription">Valide jusqu&apos;à {validityYear}</span>
        ) : (
          <span className="card-inscription" />
        )}
      </div>
      <div className="card-bottom-accent" />
    </div>
  );

  const identity = (
    <div className="card-identity">
      <div className="card-fullname">
        <span className="card-firstname">{judoka.prenom}</span>
        <span className="card-name">{judoka.nom}</span>
      </div>
      <DetailsGrid judoka={judoka} fields={fields} />
    </div>
  );

  return (
    <div
      className={`judoka-card layout-${layout}`}
      id="printable-card"
      style={styleVars}
      data-layout={layout}
    >
      <div className="card-front">
        <div className="card-top-accent" />

        {layout === 'banner' && (
          <>
            <div className="card-banner-row">
              <div className="card-photo-frame">
                <PhotoBlock judoka={judoka} />
              </div>
              <div className="card-banner-main">
                <div className="card-header-full card-header-inline">
                  <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
                  <div className="card-header-text">
                    <span className="card-org">{orgName}</span>
                    <span className="card-year">{subtitle}</span>
                  </div>
                </div>
                {identity}
              </div>
              <QrBlock judoka={judoka} qrValue={qrValue} />
            </div>
            {footer}
          </>
        )}

        {layout === 'stacked' && (
          <>
            <div className="card-header-full">
              <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
              <div className="card-header-text">
                <span className="card-org">{orgName}</span>
                <span className="card-year">{subtitle}</span>
              </div>
              <QrBlock judoka={judoka} qrValue={qrValue} />
            </div>
            <div className="card-body card-body-stacked">
              <div className="card-photo-frame">
                <PhotoBlock judoka={judoka} />
              </div>
              {identity}
            </div>
            {footer}
          </>
        )}

        {layout === 'stripe' && (
          <>
            <div className="card-body card-body-stripe">
              <div className="card-stripe-side">
                <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
                <div className="card-photo-frame">
                  <PhotoBlock judoka={judoka} />
                </div>
              </div>
              <div className="card-stripe-main">
                <div className="card-header-text">
                  <span className="card-org card-org-dark">{orgName}</span>
                  <span className="card-year card-year-muted">{subtitle}</span>
                </div>
                {identity}
                <div className="card-stripe-bottom">
                  <span className="card-number">{judoka.numero_carte}</span>
                  <QrBlock judoka={judoka} qrValue={qrValue} />
                </div>
              </div>
            </div>
            {design.show_validity !== false ? (
              <div className="card-footer-zone">
                <div className="card-footer-bar">
                  <span className="card-inscription">Valide jusqu&apos;à {validityYear}</span>
                </div>
                <div className="card-bottom-accent" />
              </div>
            ) : (
              <div className="card-bottom-accent" />
            )}
          </>
        )}

        {layout === 'split' && (
          <>
            <div className="card-body card-body-split">
              <div className="card-split-left">
                <div className="card-header-full card-header-compact">
                  <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
                  <div className="card-header-text">
                    <span className="card-org">{orgName}</span>
                    <span className="card-year">{subtitle}</span>
                  </div>
                </div>
                <div className="card-photo-frame">
                  <PhotoBlock judoka={judoka} />
                </div>
                <span className="card-number card-number-block">{judoka.numero_carte}</span>
              </div>
              <div className="card-split-right">
                {identity}
                <QrBlock judoka={judoka} qrValue={qrValue} />
                {design.show_validity !== false ? (
                  <span className="card-inscription">Valide jusqu&apos;à {validityYear}</span>
                ) : null}
              </div>
            </div>
            <div className="card-bottom-accent" />
          </>
        )}

        {(layout === 'classic' || !['banner', 'stacked', 'stripe', 'split'].includes(layout)) && (
          <>
            <div className="card-header-full">
              <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
              <div className="card-header-text">
                <span className="card-org">{orgName}</span>
                <span className="card-year">{subtitle}</span>
              </div>
            </div>

            <div className="card-body">
              <div className="card-photo-frame">
                <PhotoBlock judoka={judoka} />
              </div>
              <div className="card-info">
                <div className="card-fullname">
                  <span className="card-firstname">{judoka.prenom}</span>
                  <span className="card-name">{judoka.nom}</span>
                </div>
                <DetailsGrid judoka={judoka} fields={fields} />
              </div>
              <QrBlock judoka={judoka} qrValue={qrValue} />
            </div>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}
