import { useEffect, useMemo, useRef, useState } from 'react';

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function DrawAnimation({ items = [], title = 'Tirage au sort', onDone }) {
  const chips = useMemo(
    () => shuffle((items || []).filter(Boolean)).slice(0, 24),
    [items]
  );
  const [tick, setTick] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const spin = setInterval(() => setTick((n) => n + 1), 140);
    const done = setTimeout(() => onDoneRef.current?.(), 3200);
    return () => {
      clearInterval(spin);
      clearTimeout(done);
    };
  }, []);

  const highlight = chips.length ? chips[tick % chips.length] : '';

  return (
    <div className="draw-animation">
      <p className="draw-animation-kicker">Fédération Internationale · Tirage</p>
      <h3>{title}</h3>
      <div className="draw-animation-bowl" aria-hidden="true">
        {chips.map((label, idx) => (
          <span
            key={`${label}-${idx}`}
            className={`draw-chip ${label === highlight ? 'is-hot' : ''}`}
            style={{ animationDelay: `${(idx % 8) * 0.08}s` }}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="draw-animation-status">Mélange des participants…</p>
    </div>
  );
}
