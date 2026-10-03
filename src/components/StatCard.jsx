function MiniBars({ values = [] }) {
  const bars = values.length ? values : [35, 55, 40, 70, 48, 62];
  const max = Math.max(...bars, 1);
  return (
    <div className="stat-mini-bars" aria-hidden="true">
      {bars.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className={`stat-mini-bar ${i === bars.length - 2 ? 'is-accent' : ''}`}
          style={{ height: `${Math.max(18, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export default function StatCard({
  theme = 'blue',
  icon,
  value,
  label,
  onClick,
  active = false,
  type = 'button',
  bars,
  showBars = true,
}) {
  const className = [
    'stat-card',
    `stat-theme-${theme}`,
    onClick ? 'stat-clickable' : '',
    active ? 'stat-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <div className="stat-card-main">
        {icon && (
          <span className="stat-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="stat-body">
          <span className="stat-value">{value}</span>
          <span className="stat-label">{label}</span>
        </span>
      </div>
      {showBars && <MiniBars values={bars} />}
    </>
  );

  if (onClick) {
    return (
      <button type={type} className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
