import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stampScan } from '@/lib/files';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Streams a stored file to someone entitled to see its document. Row Level Security decides who;
 *  every open or download is written to the audit trail. A stamped copy (reference number and
 *  receipt date) is produced on the fly; the stored original is never modified. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: v } = await supabase.from('document_file_versions')
    .select('id, document_id, storage_bucket, storage_path, mime_type, original_filename, version_number, file:document_files(file_kind), doc:documents(reference_number, received_at, direction)')
    .eq('id', versionId).maybeSingle();
  if (!v) return new NextResponse('Not found', { status: 404 });
  const download = req.nextUrl.searchParams.get('download') === '1';
  const raw = req.nextUrl.searchParams.get('raw') === '1';
  const { data: blob, error } = await supabase.storage.from(v.storage_bucket).download(v.storage_path);
  if (error || !blob) return new NextResponse('The stored file could not be read.', { status: 502 });
  await supabase.rpc('log_client_event', {
    p_event: download ? 'document_downloaded' : 'document_viewed', p_document_id: v.document_id,
    p_details: { file_version_id: v.id, version: v.version_number, stamped: !raw },
  });
  let body: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  let mime = v.mime_type as string;
  let name = (v.original_filename as string) || `${(v.doc as any)?.reference_number}.pdf`;
  if (!raw) {
    const d: any = v.doc;
    const lines = [d.reference_number];
    if (d.direction === 'incoming' && d.received_at) lines.push(`Received ${fmtDate(d.received_at)}`);
    const stamped = await stampScan(Buffer.from(body), mime, lines).catch(() => null);
    if (stamped) { body = stamped; mime = 'application/pdf'; name = name.replace(/\.[^.]+$/, '') + '.pdf'; }
  }
  const safe = name.replace(/[^\w.\- ]+/g, '_');
  return new NextResponse(body as BodyInit, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safe}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
