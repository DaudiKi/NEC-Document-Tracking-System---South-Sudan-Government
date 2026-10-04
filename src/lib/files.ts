import 'server-only';
import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from '@/lib/constants';
import { UserError } from '@/lib/actions';

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/tiff': 'tif' };
const BY_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };

export type FileMeta = {
  storage_path: string; mime_type: string; size_bytes: number; sha256: string; original_filename: string;
  page_count: number | null; ocr_text: string | null; is_pdfa: boolean;
};

function mimeOf(file: File) {
  if (ALLOWED_MIME.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? '';
}

/** Validates a scan, fingerprints it (SHA-256), reads the page count and any text layer, and
 *  stores it in the private bucket as {document}/{file}/v{n}.{ext}. Files are never overwritten. */
export async function storeFile(
  supabase: SupabaseClient, file: File | null, docId: string, fileId: string, version: number,
  opts: { expectedPages?: number } = {},
): Promise<FileMeta> {
  if (!file || file.size === 0) throw new UserError('Choose the scanned file.');
  const mime = mimeOf(file);
  if (!mime) throw new UserError('The file must be a PDF, JPEG, PNG or TIFF.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UserError(`The file is ${(file.size / 1048576).toFixed(1)} MB. The limit on this server is ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB. Scan at lower resolution or split attachments into separate files.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  let pages: number | null = null;
  let text: string | null = null;
  let pdfa = false;
  if (mime === 'application/pdf') {
    try {
      pages = (await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
    } catch {
      throw new UserError('That PDF could not be read. Re-scan it or save it again as a PDF.');
    }
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const r = await extractText(pdf, { mergePages: true });
      const t = (Array.isArray(r.text) ? r.text.join('\n') : r.text).replace(/\s+/g, ' ').trim();
      text = t.length > 20 ? t.slice(0, 2_000_000) : null;
    } catch {
      text = null;
    }
    pdfa = buf.includes('pdfaid:part');
  } else {
    pages = 1;
  }
  if (opts.expectedPages && pages && mime === 'application/pdf' && pages !== opts.expectedPages) {
    throw new UserError(`The scan has ${pages} page(s) but you entered ${opts.expectedPages}. Correct the page count or re-scan, so the register matches the scan.`);
  }
  const path = `${docId}/${fileId}/v${version}.${EXT[mime]}`;
  const { error } = await supabase.storage.from('document-files').upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw new UserError('The file could not be stored: ' + error.message);
  return { storage_path: path, mime_type: mime, size_bytes: buf.length, sha256, original_filename: file.name, page_count: pages, ocr_text: text, is_pdfa: pdfa };
}

/** Writes the reference number (and receipt date) on the first page of a copy of the scan. The
 *  stored original is never modified. TIFF files are returned unstamped (null). */
export async function stampScan(buf: Buffer, mime: string, lines: string[]): Promise<Uint8Array | null> {
  let doc: PDFDocument;
  if (mime === 'application/pdf') {
    doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  } else if (mime === 'image/jpeg' || mime === 'image/png') {
    doc = await PDFDocument.create();
    const img = mime === 'image/png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else {
    return null;
  }
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const size = Math.max(8, Math.min(11, width / 60));
  const textW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)));
  const boxW = textW + 14;
  const boxH = lines.length * (size + 3) + 8;
  const x = width - boxW - 18;
  const y = height - boxH - 18;
  page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), borderColor: rgb(0.01, 0.01, 0.01), borderWidth: 1 });
  lines.forEach((l, i) => page.drawText(l, { x: x + 7, y: y + boxH - 6 - size - i * (size + 3), size, font, color: rgb(0.01, 0.01, 0.01) }));
  return doc.save();
}
