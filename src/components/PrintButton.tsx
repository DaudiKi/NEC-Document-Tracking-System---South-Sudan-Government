'use client';
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button type="button" className="nec-btn nec-btn--primary" onClick={() => window.print()}>{label}</button>;
}
