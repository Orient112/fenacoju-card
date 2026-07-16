import { useState } from 'react';
import { USER_TYPES } from '../api';

const FEDERATION_CHOICES = [
  {
    key: 'federation',
    label: 'Compte Fédération',
    description: 'Compte avec identifiant et mot de passe',
  },
  {
    key: 'membre',
    label: 'Membre Fédération',
    description: 'Compte sans identifiant et mot de passe',
  },
];

const TYPE_ORDER = ['federation', 'ligue', 'entente', 'club', 'entraineur', 'arbitre'];

function buildDisplayTypes(allowedTypes, includeArbitre, groupFederation) {
  const allowed = new Set(allowedTypes?.length ? allowedTypes : Object.keys(USER_TYPES));
  if (includeArbitre) allowed.add('arbitre');

  const hasFedGroup =
    groupFederation && (allowed.has('federation') || allowed.has('membre'));

  const display = [];

  if (hasFedGroup) {
    display.push({
      key: 'federation-group',
      label: 'Fédération',
      description: 'Compte connecté ou fiche membre de la fédération',
      isGroup: true,
    });
  }

  for (const key of TYPE_ORDER) {
    if (key === 'federation' || key === 'membre') continue;
    if (!allowed.has(key)) continue;
    if (key === 'arbitre') {
      display.push({
        key: 'arbitre',
        label: 'Arbitre',
        description: 'Fiche arbitre (National, Intercontinental, International) — sans connexion',
      });
      continue;
    }
    const info = USER_TYPES[key] || { label: key, description: '' };
    display.push({ key, label: info.label, description: info.description });
  }

  // Types non listés dans TYPE_ORDER (sauf federation/membre déjà groupés)
  for (const key of allowed) {
    if (TYPE_ORDER.includes(key) || key === 'membre' || key === 'federation') continue;
    if (display.some((d) => d.key === key)) continue;
    const info = USER_TYPES[key] || { label: key, description: '' };
    display.push({ key, label: info.label, description: info.description });
  }

  return display;
}

export default function CreateTypeModal({
  allowedTypes,
  includeArbitre = false,
  groupFederation = false,
  onSelect,
  onClose,
}) {
  const [showFedChoices, setShowFedChoices] = useState(false);
  const types = buildDisplayTypes(allowedTypes, includeArbitre, groupFederation);

  if (showFedChoices) {
    return (
      <div className="confirm-overlay" onClick={onClose}>
        <div className="create-type-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Fédération</h3>
          <p className="create-type-subtitle">Choisissez le type de compte fédéral</p>

          <div className="create-type-options">
            {FEDERATION_CHOICES.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`create-type-option create-type-${opt.key}`}
                onClick={() => onSelect(opt.key)}
              >
                <span className="create-type-label">{opt.label}</span>
                <span className="create-type-desc">{opt.description}</span>
              </button>
            ))}
          </div>

          <div className="create-type-actions">
            <button type="button" className="btn btn-outline" onClick={() => setShowFedChoices(false)}>
              Retour
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="create-type-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Créer un utilisateur</h3>
        <p className="create-type-subtitle">Choisissez le type d'utilisateur à enregistrer</p>

        <div className="create-type-options">
          {types.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`create-type-option create-type-${item.key}`}
              onClick={() => {
                if (item.isGroup) setShowFedChoices(true);
                else onSelect(item.key);
              }}
            >
              <span className="create-type-label">{item.label}</span>
              <span className="create-type-desc">{item.description}</span>
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-outline" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}
