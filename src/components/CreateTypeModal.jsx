import { USER_TYPES } from '../api';

export default function CreateTypeModal({ allowedTypes, includeArbitre = false, onSelect, onClose }) {
  const types = allowedTypes?.length
    ? [...allowedTypes]
    : Object.keys(USER_TYPES);

  if (includeArbitre && !types.includes('arbitre')) {
    types.push('arbitre');
  }

  const labels = {
    ...USER_TYPES,
    arbitre: {
      label: 'Arbitre',
      description: 'Fiche arbitre (National, Intercontinental, International) — sans connexion',
    },
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="create-type-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Créer un utilisateur</h3>
        <p className="create-type-subtitle">Choisissez le type à enregistrer</p>

        <div className="create-type-options">
          {types.map((key) => {
            const info = labels[key] || { label: key, description: '' };
            return (
              <button
                key={key}
                type="button"
                className={`create-type-option create-type-${key}`}
                onClick={() => onSelect(key)}
              >
                <span className="create-type-label">{info.label}</span>
                <span className="create-type-desc">{info.description}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="btn btn-outline" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}
