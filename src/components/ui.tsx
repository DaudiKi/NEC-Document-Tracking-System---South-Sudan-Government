import Link from 'next/link';
import type { Row } from '@/lib/constants';
import {
  STATUS_LABEL, PRIORITY_LABEL, CLASS_LABEL, badgeClassForStatus, badgeClassForPriority, badgeClassForClass,
} from '@/lib/constants';

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <>
      <span className={`badge ${badgeClassForStatus(status, false)}`}>{STATUS_LABEL[status] ?? status}</span>
      {overdue && <> <span className="badge badge--danger">Overdue</span></>}
    </>
  );
}
export const PriorityBadge = ({ p }: { p: string }) => <span className={`badge ${badgeClassForPriority(p)}`}>{PRIORITY_LABEL[p] ?? p}</span>;
export const ClassBadge = ({ c }: { c: string }) => <span className={`badge ${badgeClassForClass(c)}`}>{CLASS_LABEL[c] ?? c}</span>;

export function PageHead({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="nec-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function Notice({ kind = 'info', label, children }: { kind?: 'info' | 'warning' | 'danger' | 'success'; label: string; children: React.ReactNode }) {
  return <div className={`notice notice--${kind}`}><strong>{label}</strong>{children}</div>;
}

export function Field({ label, hint, required, children, htmlFor }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}{required ? '' : <span className="req"> (optional)</span>}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Select({ name, rows, value, label = 'name', required, placeholder = 'Select…', id, disabled }: {
  name: string; rows: Row[]; value?: string | number | null; label?: string | ((r: Row) => string); required?: boolean; placeholder?: string; id?: string; disabled?: boolean;
}) {
  return (
    <select name={name} id={id ?? name} defaultValue={value ?? ''} required={required} disabled={disabled}>
      <option value="">{placeholder}</option>
      {rows.map((r) => (
        <option key={r.id ?? r.code ?? r.priority} value={r.id ?? r.priority}>{typeof label === 'function' ? label(r) : r[label]}</option>
      ))}
    </select>
  );
}

export function DocLink({ id, reference }: { id: string; reference: string }) {
  return <Link href={`/documents/${id}`} className="ref">{reference}</Link>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
