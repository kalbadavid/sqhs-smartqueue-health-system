export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex items-end justify-between mb-7">
      <div>
        {eyebrow && (
          <div className="text-[11px] tracking-[0.18em] uppercase text-ink-700/65 font-medium mb-1.5">{eyebrow}</div>
        )}
        <h1 className="text-3xl text-ink-900 tracking-tight leading-none font-bold">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-ink-700/80 mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
