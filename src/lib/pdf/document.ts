import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { branding, logoPng } from "@/features/settings/organization";
import { brandPalette } from "@/lib/branding/palette";
/** A4 portrait or landscape document with the organization logo, legal name and address on every page. */
export type Column = { label: string; width: number; align?: "left" | "right" };
const A4: [number, number] = [595.28, 841.89], margin = 40;
const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const ink = rgb(0.07, 0.09, 0.15), muted = rgb(0.4, 0.44, 0.5), rule = rgb(0.85, 0.87, 0.9), band = rgb(0.96, 0.97, 0.98);
/** Standard PDF fonts cover Windows-1252 only (including •, € and ™); replace other characters instead of failing. */
export function pdfText(value: unknown) {
  return String(value ?? "").replace(/৳\s?/g, "BDT ").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7e\xa0-\xff\u2022\u20ac\u2122]/g, "?");
}
export async function createPdf(title: string, subtitle: string, landscape = false) {
  const doc = await PDFDocument.create(), brand = await branding();
  const [regular, bold, logo] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold), logoPng().then(bytes => doc.embedPng(bytes))]);
  doc.setTitle(pdfText(`${title} - ${brand.legalName}`)); doc.setAuthor(pdfText(brand.legalName)); doc.setCreator("GriipBuddy People"); doc.setProducer("GriipBuddy People");
  const size: [number, number] = landscape ? [A4[1], A4[0]] : A4, accent = color(brandPalette(brand.brandColor).primary);
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: brand.timezone }).format(new Date()) + ` (${brand.timezone})`;
  const pages: PDFPage[] = [];
  let page!: PDFPage, y = 0;
  const width = size[0] - margin * 2;
  function header(p: PDFPage, image: PDFImage) {
    const top = size[1] - margin, logoSize = 46;
    p.drawImage(image, { x: margin, y: top - logoSize, width: logoSize, height: logoSize });
    p.drawText(pdfText(brand.legalName), { x: margin + logoSize + 12, y: top - 16, size: 13, font: bold, color: ink });
    const address = wrap(pdfText(brand.address), regular, 8.5, width * 0.55);
    address.slice(0, 3).forEach((line, i) => p.drawText(line, { x: margin + logoSize + 12, y: top - 30 - i * 11, size: 8.5, font: regular, color: muted }));
    const t = pdfText(title), s = pdfText(subtitle);
    p.drawText(t, { x: size[0] - margin - bold.widthOfTextAtSize(t, 14), y: top - 16, size: 14, font: bold, color: accent });
    p.drawText(s, { x: size[0] - margin - regular.widthOfTextAtSize(s, 9), y: top - 30, size: 9, font: regular, color: muted });
    p.drawRectangle({ x: margin, y: top - logoSize - 12, width, height: 1.5, color: accent });
    return top - logoSize - 30;
  }
  function addPage() { page = doc.addPage(size); pages.push(page); y = header(page, logo); }
  function ensure(height: number) { if (y - height < margin + 24) addPage(); }
  addPage();
  const api = {
    get width() { return width; },
    heading(text: string) { ensure(30); y -= 6; page.drawText(pdfText(text), { x: margin, y, size: 11, font: bold, color: ink }); y -= 14; },
    paragraph(text: string, fontSize = 9) { for (const line of wrap(pdfText(text), regular, fontSize, width)) { ensure(fontSize + 4); page.drawText(line, { x: margin, y, size: fontSize, font: regular, color: muted }); y -= fontSize + 4; } y -= 4; },
    /** Two-column label/value grid. */
    details(rows: [string, string][], columns = 2) {
      const colWidth = width / columns;
      for (let i = 0; i < rows.length; i += columns) {
        ensure(28);
        rows.slice(i, i + columns).forEach(([label, value], j) => {
          const x = margin + j * colWidth;
          page.drawText(pdfText(label).toUpperCase(), { x, y, size: 7, font: bold, color: muted });
          page.drawText(fit(pdfText(value) || "-", regular, 10, colWidth - 10), { x, y: y - 12, size: 10, font: regular, color: ink });
        });
        y -= 28;
      }
      y -= 4;
    },
    /** Table with a repeating header row; text is truncated to its column. */
    table(columns: Column[], rows: (string | number | null)[][], options: { totals?: (string | number | null)[]; auto?: boolean } = {}) {
      // Auto: each column's natural width is its widest header or cell; spare room is shared, overflow is scaled down.
      const natural = columns.map((c, i) => 10 + Math.max(bold.widthOfTextAtSize(pdfText(c.label), 8.5), ...rows.map(r => regular.widthOfTextAtSize(pdfText(r[i] ?? "-"), 8.5))));
      const weights = options.auto ? natural : columns.map(c => c.width), sum = weights.reduce((n, w) => n + w, 0);
      const widths = options.auto && sum <= width ? natural.map(w => w + (width - sum) * w / sum) : weights.map(w => w * width / sum), rowHeight = 16;
      const drawRow = (cells: (string | number | null)[], font: PDFFont, fill?: ReturnType<typeof rgb>) => {
        if (fill) page.drawRectangle({ x: margin, y: y - 4.5, width, height: rowHeight, color: fill });
        let x = margin;
        cells.forEach((cell, i) => {
          const text = fit(pdfText(cell ?? "-"), font, 8.5, widths[i] - 8), right = columns[i].align === "right";
          page.drawText(text, { x: right ? x + widths[i] - 4 - font.widthOfTextAtSize(text, 8.5) : x + 4, y, size: 8.5, font, color: ink });
          x += widths[i];
        });
        y -= rowHeight;
      };
      const head = () => { ensure(rowHeight * 2); drawRow(columns.map(c => c.label), bold, band); };
      head();
      for (const row of rows) {
        if (y - rowHeight < margin + 24) { addPage(); head(); }
        drawRow(row, regular); page.drawLine({ start: { x: margin, y: y + rowHeight - 4.5 }, end: { x: margin + width, y: y + rowHeight - 4.5 }, thickness: 0.5, color: rule });
      }
      if (!rows.length) { ensure(rowHeight); page.drawText("No records for the selected filters.", { x: margin + 4, y, size: 8.5, font: regular, color: muted }); y -= rowHeight; }
      if (options.totals) { ensure(rowHeight); drawRow(options.totals, bold, band); }
      y -= 8;
    },
    /** Right-aligned emphasized amount line, e.g. net pay. */
    total(label: string, value: string) {
      y -= 10; ensure(34); page.drawRectangle({ x: margin, y: y - 10, width, height: 28, color: band });
      page.drawText(pdfText(label), { x: margin + 10, y: y, size: 11, font: bold, color: ink });
      const v = pdfText(value); page.drawText(v, { x: margin + width - 10 - bold.widthOfTextAtSize(v, 13), y: y - 1, size: 13, font: bold, color: accent }); y -= 40;
    },
    async bytes() {
      pages.forEach((p, i) => {
        const footer = pdfText(`${brand.legalName} - Confidential - Generated ${generated}`), number = `Page ${i + 1} of ${pages.length}`;
        p.drawLine({ start: { x: margin, y: margin + 8 }, end: { x: size[0] - margin, y: margin + 8 }, thickness: 0.5, color: rule });
        p.drawText(fit(footer, regular, 7.5, width - 80), { x: margin, y: margin - 4, size: 7.5, font: regular, color: muted });
        p.drawText(number, { x: size[0] - margin - regular.widthOfTextAtSize(number, 7.5), y: margin - 4, size: 7.5, font: regular, color: muted });
      });
      return doc.save();
    },
  };
  return api;
}
function fit(text: string, font: PDFFont, size: number, max: number) {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let value = text; while (value.length > 1 && font.widthOfTextAtSize(value + "...", size) > max) value = value.slice(0, -1);
  return value + "...";
}
function wrap(text: string, font: PDFFont, size: number, max: number) {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) > max && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
