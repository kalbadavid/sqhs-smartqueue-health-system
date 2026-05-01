export function Card({ children, className = '', tone, accent = false, ...props }) {
  const toneStyles = tone
    ? `border-${tone}-600/25 bg-${tone}-50/40`
    : 'border-bone-200 bg-surface';
  return (
    <div
      className={`rounded-xl border overflow-hidden ${toneStyles} ${accent ? 'shadow-[var(--shadow-card)]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`px-5 pt-4 pb-3 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-[13px] tracking-[0.12em] uppercase text-ink-700/70 font-semibold ${className}`}>{children}</h3>;
}
