const TZ = 'Africa/Juba';
const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dttf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** DD/MM/YYYY in South Sudan time. */
export function fmtDate(v?: string | Date | null) {
  if (!v) return '';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00Z') : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : dtf.format(d);
}
/** DD/MM/YYYY HH:mm (CAT). */
export function fmtDateTime(v?: string | Date | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : dttf.format(d).replace(',', '');
}
/** "3 days 4 h" style duration since a timestamp. */
export function fmtSince(v?: string | null) {
  if (!v) return '';
  const ms = Date.now() - new Date(v).getTime();
  if (ms < 0) return 'just now';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}
/** <input type="datetime-local"> value (CAT wall time) to an ISO string with the +02:00 offset. */
export function catToIso(local: string) {
  if (!local) return null;
  return `${local.length === 16 ? local + ':00' : local}+02:00`;
}
/** Date (YYYY-MM-DD) for "today" in South Sudan. */
export function todayCat() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return p;
}
export function catRangeToUtc(from?: string, to?: string) {
  return {
    from: from ? `${from}T00:00:00+02:00` : null,
    to: to ? `${to}T23:59:59.999+02:00` : null,
  };
}
export function pretty(v: string) {
  return v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
export function yn(v: unknown) {
  return v === true ? 'Yes' : v === false ? 'No' : '';
}
