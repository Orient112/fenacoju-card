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

function getCardQrValue(judoka, qrOrg) {
  return JSON.stringify({
    org: qrOrg || 'FENACOJU',
    id: judoka.id,
    carte: judoka.numero_carte,
    structure: judoka.hierarchy_id || judoka.club_code || '',
  });
}

export default function JudokaCard({ judoka, design: designProp = null, branding = null }) {
  const design = normalizeCardDesign(designProp || {});
  const validityYear = getCardValidityYear(judoka);
  const currentYear = new Date().getFullYear();
  const qrValue = getCardQrValue(judoka, design.qr_org);
  const logoSrc = resolveCardLogo(design, branding);
  const orgName = design.org_name || branding?.nom || 'Fédération';
  const subtitle = formatSubtitle(design.subtitle, currentYear);
  const fields = design.fields || {};
  const colors = design.colors || {};

  const styleVars = {
    '--card-header-bg': colors.header_bg,
    '--card-accent-gradient': `linear-gradient(90deg, ${colors.accent_start} 0%, ${colors.accent_mid} 45%, ${colors.accent_end} 100%)`,
    '--card-name-color': colors.name,
    '--card-label-color': colors.label,
    '--card-photo-border': colors.photo_border,
  };

  return (
    <div className="judoka-card" id="printable-card" style={styleVars}>
      <div className="card-front">
        <div className="card-top-accent" />

        <div className="card-header-full">
          <img src={logoSrc} alt="" className="card-brand-logo" crossOrigin="anonymous" />
          <div className="card-header-text">
            <span className="card-org">{orgName}</span>
            <span className="card-year">{subtitle}</span>
          </div>
        </div>

        <div className="card-body">
          <div className="card-photo-frame">
            {judoka.photo ? (
              <img
                src={resolveMediaUrl(judoka.photo)}
                alt=""
                className="card-photo"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="card-photo-placeholder">
                <span>Photo</span>
              </div>
            )}
          </div>

          <div className="card-info">
            <div className="card-fullname">
              <span className="card-firstname">{judoka.prenom}</span>
              <span className="card-name">{judoka.nom}</span>
            </div>

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
          </div>

          <div className="card-qr" aria-label={`QR Code carte ${judoka.numero_carte}`}>
            <QRCode
              value={qrValue}
              size={200}
              level="L"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        </div>

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
      </div>
    </div>
  );
}
