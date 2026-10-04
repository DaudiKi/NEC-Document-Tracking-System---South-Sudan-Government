export type Role = 'system_administrator' | 'registry_officer' | 'action_officer' | 'executive_viewer' | 'auditor';
export type Row = Record<string, any>;

export const ROLE_LABEL: Record<Role, string> = {
  system_administrator: 'System Administrator',
  registry_officer: 'Registry Officer',
  action_officer: 'Action Officer',
  executive_viewer: 'Executive Viewer',
  auditor: 'Auditor',
};

export const STATUS_LABEL: Record<string, string> = {
  registered: 'Registered',
  routed: 'Routed',
  with_action_officer: 'With action officer',
  action_taken: 'Action taken',
  returned_for_clarification: 'Returned for clarification',
  on_hold: 'On hold',
  filed: 'Filed (no action required)',
  draft: 'Draft',
  final: 'Final (locked)',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  awaiting_feedback: 'Awaiting feedback',
  closed: 'Closed',
};

export const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
export const CLASS_LABEL: Record<string, string> = { open: 'Open', restricted: 'Restricted', confidential: 'Confidential' };
export const METHOD_LABEL: Record<string, string> = {
  hand_delivery: 'Hand delivery', courier: 'Courier', post: 'Post', email: 'Email', fax: 'Fax',
};
export const SIGNATORY_LABEL: Record<string, string> = {
  chairperson: 'Chairperson', secretary_general: 'Secretary General', delegated_officer: 'Delegated officer',
};
export const ACTION_LABEL: Record<string, string> = {
  comment: 'Comment', action_taken: 'Action taken', feedback: 'Feedback', task_completed: 'Task completed',
  clarification_requested: 'Clarification requested',
};
export const EVENT_LABEL = (e: string) => e.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const OPEN_STATUSES = [
  'registered', 'routed', 'with_action_officer', 'action_taken', 'returned_for_clarification', 'on_hold',
  'draft', 'final', 'dispatched', 'delivered', 'awaiting_feedback',
];

export const KB = 1024;
/** Vercel functions accept at most 4.5 MB per request; an office server has no such limit. */
export const MAX_UPLOAD_BYTES = (process.env.VERCEL ? 4 : Number(process.env.MAX_UPLOAD_MB || 25)) * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];

export function badgeClassForStatus(status: string, overdue?: boolean) {
  if (overdue) return 'badge--danger';
  if (status === 'closed' || status === 'filed' || status === 'delivered') return 'badge--success';
  if (status === 'on_hold' || status === 'returned_for_clarification' || status === 'awaiting_feedback') return 'badge--warning';
  if (status === 'draft') return 'badge--plain';
  return '';
}
export function badgeClassForPriority(p: string) {
  return p === 'urgent' ? 'badge--danger' : p === 'high' ? 'badge--warning' : 'badge--plain';
}
export function badgeClassForClass(c: string) {
  return c === 'confidential' ? 'badge--ink' : c === 'restricted' ? 'badge--info' : 'badge--plain';
}
