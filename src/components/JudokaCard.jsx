import QRCode from 'react-qr-code';
import { formatDate, calcAge, getCardValidityYear, FENACOJU_BLUE, resolveMediaUrl } from '../api';

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
  const validityYear = getCardValidityYear(judoka);

  return (
    <div className="judoka-card" id="printable-card">
      <div className="card-front">
        <div className="card-header-zone">
          <div className="card-top-accent" />
          <div className="card-header-full">
            <img src="/fenacoju-icon.png" alt="FENACOJU" className="card-brand-logo" />
            <div className="card-header-text">
              <span className="card-org">Fédération Nationale de Judo</span>
              <span className="card-year">Carte Judoka {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

        <div className="card-body">
          <div className="card-photo-frame">
            {judoka.photo ? (
              <img src={resolveMediaUrl(judoka.photo)} alt="" className="card-photo" />
            ) : (
              <div className="card-photo-placeholder">
                <span>Photo</span>
              </div>
            )}
          </div>

          <div className="card-main">
            <div className="card-info">
              <div className="card-fullname">
                <span className="card-firstname">{judoka.prenom}</span>
                <span className="card-name">{judoka.nom}</span>
              </div>

              <div className="card-details-grid">
                <div className="card-detail">
                  <span className="card-label">Né(e)</span>
                  <span>{formatDate(judoka.date_naissance)} ({calcAge(judoka.date_naissance)} ans)</span>
                </div>
                <div className="card-detail">
                  <span className="card-label">Club</span>
                  <span>{judoka.club}</span>
                </div>
                <div className="card-detail">
                  <span className="card-label">Grade</span>
                  <span>{judoka.grade}</span>
                </div>
                {judoka.categorie && (
                  <div className="card-detail">
                    <span className="card-label">Catégorie</span>
                    <span>{judoka.categorie}</span>
                  </div>
                )}
                {judoka.numero_licence && (
                  <div className="card-detail">
                    <span className="card-label">Licence</span>
                    <span>{judoka.numero_licence}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card-qr" aria-label={`QR Code carte ${judoka.numero_carte}`}>
              <QRCode
                value={qrValue}
                size={58}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
          </div>
        </div>

        <div className="card-footer-bar">
          <span className="card-number">{judoka.numero_carte}</span>
          <span className="card-inscription">Valide jusqu'à {validityYear}</span>
        </div>

        <div className="card-bottom-accent" />
      </div>
    </div>
  );
}
