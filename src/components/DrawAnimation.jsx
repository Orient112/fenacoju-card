import { useEffect, useMemo, useRef, useState } from 'react';

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function DrawAnimation({ items = [], title = 'Tirage au sort', durationMs = 10000, onDone }) {
  const sourceKey = (items || []).filter(Boolean).join('\u0001');
  const chips = useMemo(
    () => shuffle(sourceKey ? sourceKey.split('\u0001') : []).slice(0, 36),
    [sourceKey]
  );
  const [tick, setTick] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const secondsLeft = Math.max(0, Math.ceil((durationMs - tick * 100) / 1000));

  useEffect(() => {
    const spin = setInterval(() => setTick((n) => n + 1), 100);
    const done = setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => {
      clearInterval(spin);
      clearTimeout(done);
    };
  }, [durationMs]);

  const highlight = chips.length ? chips[tick % chips.length] : '';

  return (
    <div className="draw-animation draw-animation-full">
      <p className="draw-animation-kicker">Fédération Internationale de Judo · Tirage au sort</p>
      <h3>{title}</h3>
      <div className="draw-animation-timer" aria-live="polite">{secondsLeft}s</div>
      <div className="draw-animation-bowl" aria-hidden="true">
        {chips.map((label, idx) => (
          <span
            key={`${label}-${idx}`}
            className={`draw-chip ${label === highlight ? 'is-hot' : ''}`}
            style={{ animationDelay: `${(idx % 10) * 0.06}s` }}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="draw-animation-status">Mélange officiel des participants…</p>
    </div>
  );
}
