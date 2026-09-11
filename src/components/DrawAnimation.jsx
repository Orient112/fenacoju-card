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
    () => shuffle(sourceKey ? sourceKey.split('\u0001') : []).slice(0, 16),
    [sourceKey]
  );
  const [tick, setTick] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const secondsLeft = Math.max(0, Math.ceil((durationMs - tick * 100) / 1000));
  const progress = Math.min(100, (tick * 100 / durationMs) * 100);

  useEffect(() => {
    const spin = setInterval(() => setTick((n) => n + 1), 100);
    const done = setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => {
      clearInterval(spin);
      clearTimeout(done);
    };
  }, [durationMs]);

  const highlight = chips.length ? chips[tick % chips.length] : '…';
  const count = Math.max(chips.length, 1);

  return (
    <div className="draw-animation draw-animation-full">
      <h3>{title}</h3>
      <div className="draw-stage" aria-hidden="true">
        <div className="draw-stage-glow" />
        <div className="draw-ring draw-ring-outer" />
        <div className="draw-ring draw-ring-inner" />
        <div className="draw-orbit">
          {chips.map((label, idx) => (
            <span
              key={`${label}-${idx}`}
              className={`draw-orbit-chip ${label === highlight ? 'is-hot' : ''}`}
              style={{ '--i': idx, '--n': count }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="draw-focus">
          <span className="draw-focus-label">En cours</span>
          <strong>{highlight}</strong>
        </div>
      </div>
      <div className="draw-animation-timer" aria-live="polite">{secondsLeft}s</div>
      <div className="draw-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="draw-animation-status">Mélange des participants…</p>
    </div>
  );
}
