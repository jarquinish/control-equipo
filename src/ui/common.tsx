import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Link } from '../state/router';

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} role="note" aria-label={text} data-tip={text}>
      <Info size={14} aria-hidden />
    </span>
  );
}

export function KpiCard({
  label,
  value,
  to,
  tone = 'default',
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  tone?: 'default' | 'red' | 'yellow' | 'green' | 'blue' | 'brand';
  hint?: string;
  icon?: ReactNode;
}) {
  const inner = (
    <>
      <span className="kpi-label">
        {icon}
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={`kpi kpi-${tone}`} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}. Ver detalle`}>
      {inner}
    </Link>
  ) : (
    <div className={`kpi kpi-${tone}`}>{inner}</div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, actions, children, className, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card section ${className ?? ''}`} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Question({ children }: { children: ReactNode }) {
  return <p className="guiding-question">{children}</p>;
}

/** Descarga un archivo generado en el navegador. */
export function downloadFile(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
