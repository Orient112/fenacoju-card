export default function StatCard({
  theme = 'blue',
  icon,
  value,
  label,
  onClick,
  active = false,
  type = 'button',
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
      <span className="stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="stat-body">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </span>
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
