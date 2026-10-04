import 'server-only';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fmtDate, fmtDateTime, pretty, yn } from '@/lib/format';

export type Col = { key: string; label: string; kind?: 'text' | 'date' | 'datetime' | 'bool' | 'enum' | 'num'; width?: number };
export type Row = Record<string, any>;

export function cell(v: any, kind: Col['kind']): string | number {
  if (v === null || v === undefined) return '';
  switch (kind) {
    case 'date': return fmtDate(v);
    case 'datetime': return fmtDateTime(v);
    case 'bool': return yn(v);
    case 'enum': return pretty(String(v));
    case 'num': return typeof v === 'number' ? v : Number(v);
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

export async function toXlsx(title: string, subtitle: string, cols: Col[], rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEC Document Tracking System';
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { color: { argb: 'FF5B6670' } };
  ws.addRow([]);
  const head = ws.addRow(cols.map((c) => c.label));
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5EDF9' } }; c.border = { bottom: { style: 'thin' } }; });
  for (const r of rows) ws.addRow(cols.map((c) => cell(r[c.key], c.kind)));
  cols.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...rows.slice(0, 200).map((r) => String(cell(r[c.key], c.kind)).length));
    ws.getColumn(i + 1).width = Math.min(Math.max(10, longest + 2), 60);
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(title: string, subtitle: string, cols: Col[], rows: Row[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 28, size = 7.5, lh = 10;
  const table = cols.map((c) => rows.slice(0, 100).reduce((m, r) => Math.max(m, String(cell(r[c.key], c.kind)).length), c.label.length));
  const total = table.reduce((a, b) => a + Math.min(Math.max(b, 6), 40), 0);
  const widths = table.map((b) => ((Math.min(Math.max(b, 6), 40)) / total) * (W - 2 * M));
  const clip = (s: string, w: number) => {
    const max = Math.max(3, Math.floor(w / (size * 0.5)));
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };
  const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?');
  let page = doc.addPage([W, H]);
  let y = H - M;
  const header = (first: boolean) => {
    if (first) {
      page.drawText(safe(title), { x: M, y: y - 14, size: 14, font: bold, color: rgb(0.01, 0.01, 0.01) });
      page.drawText(safe(subtitle), { x: M, y: y - 28, size: 8, font, color: rgb(0.36, 0.4, 0.44) });
      y -= 44;
    }
    let x = M;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: lh + 4, color: rgb(0.84, 0.93, 0.98) });
    cols.forEach((c, i) => { page.drawText(safe(clip(c.label, widths[i])), { x: x + 2, y, size, font: bold }); x += widths[i]; });
    y -= lh + 6;
  };
  header(true);
  let n = 0;
  for (const r of rows) {
    if (y < M + 20) { page = doc.addPage([W, H]); y = H - M; header(false); }
    let x = M;
    cols.forEach((c, i) => { page.drawText(safe(clip(String(cell(r[c.key], c.kind)), widths[i])), { x: x + 2, y, size, font }); x += widths[i]; });
    page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.3, color: rgb(0.88, 0.9, 0.91) });
    y -= lh + 2;
    n++;
  }
  if (n === 0) page.drawText('No records.', { x: M, y, size: 9, font });
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 14, size: 7, font, color: rgb(0.36, 0.4, 0.44) }));
  return doc.save();
}
