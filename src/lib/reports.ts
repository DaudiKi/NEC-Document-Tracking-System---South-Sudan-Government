import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Col, Row } from '@/lib/export';
import type { Role } from '@/lib/constants';
import { catRangeToUtc, todayCat } from '@/lib/format';

export type Params = { from?: string; to?: string; q?: string; ref?: string; month?: string; event?: string };
export type ReportDef = {
  slug: string; title: string; description: string;
  params: ('range' | 'org' | 'ref' | 'month' | 'event')[];
  roles?: Role[];
  columns: Col[];
  fetch: (s: SupabaseClient, p: Params) => Promise<Row[]>;
};

const LIMIT = 5000;
const range = (p: Params) => catRangeToUtc(p.from, p.to);

export const REPORTS: ReportDef[] = [
  {
    slug: 'incoming-register', title: 'Incoming register', description: 'Every incoming document registered in a date range.',
    params: ['range'],
    columns: [
      { key: 'reference_number', label: 'Reference' }, { key: 'office', label: 'Office' },
      { key: 'received_at', label: 'Received', kind: 'datetime' }, { key: 'sender_organisation', label: 'Sender organisation' },
      { key: 'sender_name', label: 'Sender' }, { key: 'sender_title', label: 'Title' },
      { key: 'delivered_by_name', label: 'Delivered by' }, { key: 'delivery_method', label: 'Method', kind: 'enum' },
      { key: 'sender_reference', label: 'Sender ref.' }, { key: 'subject', label: 'Subject' },
      { key: 'document_type', label: 'Type' }, { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority', kind: 'enum' }, { key: 'classification', label: 'Classification', kind: 'enum' },
      { key: 'response_due_date', label: 'Response due', kind: 'date' }, { key: 'status', label: 'Status', kind: 'enum' },
      { key: 'holder', label: 'Held by' }, { key: 'due_at', label: 'Due', kind: 'datetime' },
      { key: 'number_of_pages', label: 'Pages', kind: 'num' }, { key: 'physical_file_location', label: 'File location' },
      { key: 'is_voided', label: 'Voided', kind: 'bool' },
    ],
    async fetch(s, p) {
      const r = range(p);
      let q = s.from('v_incoming_register').select('*').order('registered_at', { ascending: false }).limit(LIMIT);
      if (r.from) q = q.gte('registered_at', r.from);
      if (r.to) q = q.lte('registered_at', r.to);
      return (await q).data ?? [];
    },
  },
  {
    slug: 'outgoing-register', title: 'Outgoing / dispatch register', description: 'Every outgoing document registered in a date range, with dispatch and delivery.',
    params: ['range'],
    columns: [
      { key: 'reference_number', label: 'Reference' }, { key: 'office', label: 'Office' },
      { key: 'registered_at', label: 'Registered', kind: 'datetime' }, { key: 'dispatched_at', label: 'Dispatched', kind: 'datetime' },
      { key: 'drafted_by', label: 'Drafted by' }, { key: 'signed_by', label: 'Signed by' },
      { key: 'recipients', label: 'Recipients' }, { key: 'cc', label: 'Copied to' }, { key: 'subject', label: 'Subject' },
      { key: 'document_type', label: 'Type' }, { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority', kind: 'enum' }, { key: 'classification', label: 'Classification', kind: 'enum' },
      { key: 'dispatch_method', label: 'Method', kind: 'enum' }, { key: 'dispatched_by_name', label: 'Dispatched by' },
      { key: 'delivered_at', label: 'Delivered', kind: 'datetime' }, { key: 'proof_of_delivery_note', label: 'Proof of delivery' },
      { key: 'feedback_required', label: 'Feedback required', kind: 'bool' }, { key: 'feedback_due_date', label: 'Feedback due', kind: 'date' },
      { key: 'feedback_received_at', label: 'Feedback received', kind: 'datetime' }, { key: 'status', label: 'Status', kind: 'enum' },
      { key: 'is_voided', label: 'Voided', kind: 'bool' },
    ],
    async fetch(s, p) {
      const r = range(p);
      let q = s.from('v_outgoing_register').select('*').order('registered_at', { ascending: false }).limit(LIMIT);
      if (r.from) q = q.gte('registered_at', r.from);
      if (r.to) q = q.lte('registered_at', r.to);
      return (await q).data ?? [];
    },
  },
  {
    slug: 'overdue-by-officer', title: 'Overdue and pending actions by officer', description: 'Open incoming items, grouped by the officer holding them, with days overdue.',
    params: [],
    columns: [
      { key: 'current_holder_name', label: 'Officer' }, { key: 'reference_number', label: 'Reference' }, { key: 'subject', label: 'Subject' },
      { key: 'priority', label: 'Priority', kind: 'enum' }, { key: 'status', label: 'Status', kind: 'enum' },
      { key: 'due_at', label: 'Due', kind: 'datetime' }, { key: 'days_overdue', label: 'Days overdue', kind: 'num' },
      { key: 'current_holder_since', label: 'Held since', kind: 'datetime' },
    ],
    async fetch(s) {
      const { data } = await s.from('v_document_tracker').select('*').eq('direction', 'incoming').eq('is_voided', false)
        .not('status', 'in', '(closed,filed)').order('current_holder_name').order('due_at').limit(LIMIT);
      return data ?? [];
    },
  },
  {
    slug: 'feedback-tracker', title: 'Feedback tracker for outgoing documents', description: 'Outgoing documents that need feedback: due date, officer, whether the reply has arrived.',
    params: [],
    columns: [
      { key: 'reference_number', label: 'Reference' }, { key: 'office', label: 'Office' }, { key: 'subject', label: 'Subject' },
      { key: 'recipients', label: 'Recipients' }, { key: 'dispatched_at', label: 'Dispatched', kind: 'datetime' },
      { key: 'delivered_at', label: 'Delivered', kind: 'datetime' }, { key: 'feedback_due_date', label: 'Feedback due', kind: 'date' },
      { key: 'feedback_officer', label: 'Follow-up officer' }, { key: 'feedback_status', label: 'Feedback' },
      { key: 'days_overdue', label: 'Days overdue', kind: 'num' }, { key: 'reply_reference', label: 'Reply reference' },
      { key: 'feedback_received_at', label: 'Received', kind: 'datetime' },
    ],
    async fetch(s) {
      const { data } = await s.from('v_feedback_tracker').select('*').eq('is_voided', false).order('feedback_due_date').limit(LIMIT);
      return data ?? [];
    },
  },
  {
    slug: 'document-history', title: 'Full history of one document', description: 'Every hand-over, minute, action, file version and correction for a single reference number.',
    params: ['ref'],
    columns: [
      { key: 'at', label: 'When', kind: 'datetime' }, { key: 'kind', label: 'Event' }, { key: 'by_name', label: 'By' },
      { key: 'from_name', label: 'From' }, { key: 'to_name', label: 'To' }, { key: 'detail', label: 'Detail' },
    ],
    async fetch(s, p) {
      if (!p.ref) return [];
      const { data: d } = await s.from('documents').select('id').ilike('reference_number', p.ref.trim()).maybeSingle();
      if (!d) return [];
      const { data } = await s.from('v_document_history').select('*').eq('document_id', d.id).order('at');
      return data ?? [];
    },
  },
  {
    slug: 'correspondence', title: 'Correspondence by sender or recipient organisation', description: 'All incoming and outgoing documents for an organisation.',
    params: ['org', 'range'],
    columns: [
      { key: 'organisation', label: 'Organisation' }, { key: 'direction', label: 'Direction' }, { key: 'reference_number', label: 'Reference' },
      { key: 'at', label: 'Registered', kind: 'datetime' }, { key: 'subject', label: 'Subject' }, { key: 'status', label: 'Status', kind: 'enum' },
    ],
    async fetch(s, p) {
      const r = range(p);
      let q = s.from('v_correspondence').select('*').eq('is_voided', false).order('organisation').order('at', { ascending: false }).limit(LIMIT);
      if (p.q) q = q.ilike('organisation', `%${p.q}%`);
      if (r.from) q = q.gte('at', r.from);
      if (r.to) q = q.lte('at', r.to);
      return (await q).data ?? [];
    },
  },
  {
    slug: 'audit-trail', title: 'Audit trail', description: 'Every logged event: sign-ins, views, changes, corrections, administration and exports. Administrators and Auditors only.',
    params: ['range', 'event'], roles: ['system_administrator', 'auditor'],
    columns: [
      { key: 'id', label: 'No.', kind: 'num' }, { key: 'occurred_at', label: 'When', kind: 'datetime' }, { key: 'actor', label: 'User' },
      { key: 'role', label: 'Role', kind: 'enum' }, { key: 'event_type', label: 'Event', kind: 'enum' },
      { key: 'reference', label: 'Document' }, { key: 'detail', label: 'Detail' }, { key: 'ip_address', label: 'IP address' },
    ],
    async fetch(s, p) {
      const r = range(p);
      let q = s.from('audit_log')
        .select('id, occurred_at, event_type, details, ip_address, actor:profiles!audit_log_actor_id_fkey(full_name, role), doc:documents!audit_log_document_id_fkey(reference_number)')
        .order('id', { ascending: false }).limit(LIMIT);
      if (r.from) q = q.gte('occurred_at', r.from);
      if (r.to) q = q.lte('occurred_at', r.to);
      if (p.event) q = q.eq('event_type', p.event);
      const { data } = await q;
      return (data ?? []).map((a: any) => ({
        id: a.id, occurred_at: a.occurred_at, actor: a.actor?.full_name ?? 'System', role: a.actor?.role ?? '',
        event_type: a.event_type, reference: a.doc?.reference_number ?? '', ip_address: a.ip_address ?? '',
        detail: a.details && Object.keys(a.details).length ? JSON.stringify(a.details).slice(0, 600) : '',
      }));
    },
  },
  {
    slug: 'monthly-summary', title: 'Monthly summary for management', description: 'Documents received and dispatched, by category and priority, with open and overdue totals.',
    params: ['month'],
    columns: [{ key: 'section', label: 'Section' }, { key: 'label', label: 'Item' }, { key: 'value', label: 'Value', kind: 'num' }],
    async fetch(s, p) {
      const month = p.month || todayCat().slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const { data } = await s.rpc('report_monthly_summary', { p_from: `${month}-01`, p_to: `${month}-${String(last).padStart(2, '0')}` });
      return data ?? [];
    },
  },
];

export const reportBySlug = (slug: string) => REPORTS.find((r) => r.slug === slug);

export function describeParams(p: Params) {
  const parts: string[] = [];
  if (p.from || p.to) parts.push(`${p.from ?? '…'} to ${p.to ?? '…'}`);
  if (p.q) parts.push(`organisation contains "${p.q}"`);
  if (p.ref) parts.push(`reference ${p.ref}`);
  if (p.month) parts.push(`month ${p.month}`);
  if (p.event) parts.push(`event ${p.event}`);
  return parts.join('; ') || 'All records';
}
