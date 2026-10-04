import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reportBySlug, describeParams, type Params } from '@/lib/reports';
import { toPdf, toXlsx } from '@/lib/export';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const def = reportBySlug(type);
  if (!def) return new NextResponse('Unknown report', { status: 404 });
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return new NextResponse('Sign in first', { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, full_name, is_active').eq('id', u.user.id).maybeSingle();
  if (!me?.is_active) return new NextResponse('Not allowed', { status: 403 });
  if (def.roles && !def.roles.includes(me.role)) return new NextResponse('Not allowed', { status: 403 });

  const sp = req.nextUrl.searchParams;
  const p: Params = { from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, q: sp.get('q') ?? undefined, ref: sp.get('ref') ?? undefined, month: sp.get('month') ?? undefined, event: sp.get('event') ?? undefined };
  const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx';
  const rows = await def.fetch(supabase, p);
  const subtitle = `${describeParams(p)} · ${rows.length} record(s) · generated ${fmtDateTime(new Date())} by ${me.full_name}`;

  const { error } = await supabase.rpc('log_client_event', {
    p_event: 'report_exported', p_document_id: null, p_details: { report: def.slug, format, filters: p, rows: rows.length },
  });
  if (error) return new NextResponse('The export could not be recorded in the audit trail, so it was not produced.', { status: 500 });

  const base = `${def.slug}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'pdf') {
    const pdf = await toPdf(def.title, subtitle, def.columns, rows);
    return new NextResponse(pdf as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${base}.pdf"`, 'Cache-Control': 'private, no-store' } });
  }
  const xlsx = await toXlsx(def.title, subtitle, def.columns, rows);
  return new NextResponse(xlsx as unknown as BodyInit, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"`, 'Cache-Control': 'private, no-store' } });
}
