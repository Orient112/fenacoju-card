import { formatDate, resolveMediaUrl } from '../api';

export default function JudokaAthleteSheetModal({ judoka, onClose }) {
  const j = judoka || {};
  const photo = j.photo ? resolveMediaUrl(j.photo) : '';

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="judoka-athlete-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="athlete-sheet-title">
        <header className="judoka-athlete-sheet-head">
          <div>
            <p className="judoka-fiche-kicker">Fiche Athlète</p>
            <h3 id="athlete-sheet-title">{j.prenom} {j.nom}</h3>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button>
        </header>

        <div className="judoka-athlete-sheet-body">
          <div className="judoka-athlete-sheet-photo">
            {photo ? (
              <img src={photo} alt="" />
            ) : (
              <div className="judoka-athlete-sheet-photo-empty">Sans photo</div>
            )}
          </div>
          <dl className="judoka-athlete-sheet-info">
            <div><dt>N° Carte</dt><dd>{j.numero_carte || '-'}</dd></div>
            <div><dt>Nom</dt><dd>{j.nom || '-'}</dd></div>
            <div><dt>Prénom</dt><dd>{j.prenom || '-'}</dd></div>
            <div><dt>Sexe</dt><dd>{j.sexe === 'F' ? 'Féminin' : j.sexe === 'M' ? 'Masculin' : '-'}</dd></div>
            <div><dt>Naissance</dt><dd>{formatDate(j.date_naissance) || '-'}</dd></div>
            <div><dt>Club</dt><dd>{j.club || '-'}</dd></div>
            <div><dt>Grade</dt><dd>{j.grade || '-'}</dd></div>
            <div><dt>Catégorie</dt><dd>{j.categorie || '-'}</dd></div>
            <div><dt>Licence</dt><dd>{j.numero_licence || '-'}</dd></div>
            <div><dt>Téléphone</dt><dd>{j.telephone || '-'}</dd></div>
            <div><dt>Email</dt><dd>{j.email || '-'}</dd></div>
            <div><dt>Inscription</dt><dd>{formatDate(j.date_inscription) || '-'}</dd></div>
            <div><dt>Statut</dt><dd>{j.statut === 'actif' ? 'Actif' : j.statut === 'inactif' ? 'Inactif' : (j.statut || '-')}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
