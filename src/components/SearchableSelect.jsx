import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Rechercher...',
  emptyLabel = '— Sélectionner —',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (selected) {
      setQuery(`${selected.prenom} ${selected.nom}`.trim());
    } else if (!value) {
      setQuery('');
    }
  }, [selected, value]);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? options.filter((o) => {
        const label = `${o.prenom} ${o.nom} ${o.club || ''}`.toLowerCase();
        return label.includes(term);
      })
    : options;

  const handleSelect = (option) => {
    onChange(option.id, `${option.prenom} ${option.nom}`.trim());
    setQuery(`${option.prenom} ${option.nom}`.trim());
    setOpen(false);
  };

  const handleInput = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value.trim()) onChange('', '');
  };

  return (
    <div className="searchable-select" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <ul className="searchable-select-list">
          <li>
            <button type="button" className="searchable-select-option" onClick={() => { onChange('', ''); setQuery(''); setOpen(false); }}>
              {emptyLabel}
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="searchable-select-empty">Aucun résultat</li>
          ) : (
            filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`searchable-select-option ${value === o.id ? 'active' : ''}`}
                  onClick={() => handleSelect(o)}
                >
                  <span>{o.prenom} {o.nom}</span>
                  {o.club && <span className="searchable-select-meta">{o.club}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
