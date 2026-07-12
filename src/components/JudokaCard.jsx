import QRCode from 'react-qr-code';
import { resolveMediaUrl } from '../api';

function getCardQrValue(judoka) {
  return JSON.stringify({
    org: 'FENACOJU',
    id: judoka.id,
    carte: judoka.numero_carte,
    nom: judoka.nom,
    prenom: judoka.prenom,
    club: judoka.club,
  });
}

export default function JudokaCard({ judoka }) {
  const qrValue = getCardQrValue(judoka);

  return (
    <div className="judoka-card" id="printable-card">
      <div className="card-front">
        <div className="card-top-accent" />

        <div className="card-header-full">
          <img src="/fenacoju-icon.png" alt="FENACOJU" className="card-brand-logo" crossOrigin="anonymous" />
          <div className="card-header-text">
            <span className="card-org">Fédération Nationale Congolaise de Judo</span>
            <span className="card-year">Carte Judoka {new Date().getFullYear()}</span>
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
              <div className="card-detail">
                <span className="card-label">Club</span>
                <span className="card-value">{judoka.club}</span>
              </div>
              <div className="card-detail">
                <span className="card-label">Grade</span>
                <span className="card-value">{judoka.grade}</span>
              </div>
              {judoka.categorie && (
                <div className="card-detail">
                  <span className="card-label">Catégorie</span>
                  <span className="card-value">{judoka.categorie}</span>
                </div>
              )}
              {judoka.numero_licence && (
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
              size={40}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        </div>

        <div className="card-bottom-accent" />
      </div>
    </div>
  );
}
