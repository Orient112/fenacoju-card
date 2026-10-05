import { useEffect, useId, useRef, useState } from 'react';

export function ClubLigueLabel({ nom, ligue }) {
  const name = String(nom || '').trim() || '—';
  const league = String(ligue || '').trim() || '-';
  return (
    <>
      <span className="club-select-name">{name}</span>
      <span className="club-select-sep">{' / '}</span>
      <span className="club-select-ligue">{league}</span>
    </>
  );
}

/**
 * Sélecteur de club compétition : affiche « Club / Ligue » avec ligue en gris pâle.
 * value = nom du club (string stockée sur l'inscription).
 */
export default function CompetitionClubSelect({
  id,
  name,
  value = '',
  clubs = [],
  onChange,
  required = false,
  disabled = false,
  placeholder = '— Sélectionner un club —',
  autoFocus = false,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = clubs.find(
    (c) => String(c.nom || '').trim().toLowerCase() === String(value || '').trim().toLowerCase()
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const emit = (nom) => {
    if (typeof onChange === 'function') {
      onChange({
        target: {
          name: name || id || 'club',
          value: nom,
        },
      });
    }
    setOpen(false);
  };

  return (
    <div className={`competition-club-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`competition-club-select-trigger ${!value ? 'is-placeholder' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        {selected ? (
          <ClubLigueLabel nom={selected.nom} ligue={selected.ligue} />
        ) : value ? (
          <ClubLigueLabel nom={value} ligue="" />
        ) : (
          <span className="club-select-placeholder">{placeholder}</span>
        )}
        <span className="competition-club-select-caret" aria-hidden="true" />
      </button>

      {/* Champ natif pour required / submit HTML */}
      <input
        type="text"
        name={name || id || 'club'}
        value={value}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="competition-club-select-native"
        onChange={() => {}}
      />

      {open && !disabled && (
        <ul id={listId} className="competition-club-select-menu" role="listbox">
          <li role="option" aria-selected={!value}>
            <button type="button" className="competition-club-select-option is-empty" onClick={() => emit('')}>
              {placeholder}
            </button>
          </li>
          {clubs.map((club) => {
            const nom = String(club.nom || '').trim();
            if (!nom) return null;
            const active = nom.toLowerCase() === String(value || '').trim().toLowerCase();
            return (
              <li key={club.id || nom} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`competition-club-select-option ${active ? 'is-active' : ''}`}
                  onClick={() => emit(nom)}
                >
                  <ClubLigueLabel nom={nom} ligue={club.ligue} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
