/**
 * Brand watermarks for exported documents.
 *
 * Each output format marks documents its own way, so this holds the shared
 * pieces rather than one function that pretends they are the same:
 *
 *   - PDF   — vector text drawn per page, at low opacity ({@link PDF_WATERMARK}).
 *   - Excel — a tiled PNG behind the grid, because xlsx has no watermark of its
 *             own. Excel never prints a sheet background, so the workbook also
 *             carries the marks in its print header and footer.
 *   - HTML  — the same tile as an SVG data URI, so Word and the print view get
 *             the mark without loading anything external.
 *
 * The tile is generated rather than shipped as an asset: an image file would be
 * one more thing to keep in step with {@link BRANDING}, and the drawing is a
 * dozen lines.
 */

import { BRANDING } from '@/config/branding';

/** Shared geometry, so every format's watermark reads as the same mark. */
const TILE = {
  width: 460,
  height: 300,
  /** Degrees. Negative tilts up to the right, the usual watermark direction. */
  angle: -28,
} as const;

/** Type scale within a tile: the name leads, the attribution is a footnote. */
const TILE_TEXT = [
  { text: BRANDING.name, size: 34, weight: 700, dy: -26 },
  { text: BRANDING.site, size: 20, weight: 400, dy: 8 },
  { text: BRANDING.poweredBy, size: 16, weight: 400, dy: 36 },
] as const;

/**
 * Ink for the watermark: the brand green at an opacity that survives a
 * photocopy but never competes with a figure sitting on top of it.
 */
const TILE_INK = 'rgba(15, 123, 63, 0.10)';

/**
 * The watermark tile as a PNG data URL, for Excel's sheet background.
 *
 * Returns null where there is no canvas to draw on — a non-browser build, or a
 * browser that refuses the context. Callers skip the background rather than
 * failing the export: a workbook without a watermark is still the workbook the
 * admin asked for, and the print header and footer carry the marks regardless.
 */
export function watermarkTilePng(): string | null {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = TILE.width;
    canvas.height = TILE.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.translate(TILE.width / 2, TILE.height / 2);
    ctx.rotate((TILE.angle * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TILE_INK;

    for (const line of TILE_TEXT) {
      ctx.font = `${line.weight} ${line.size}px Arial, Helvetica, sans-serif`;
      ctx.fillText(line.text, 0, line.dy);
    }

    return canvas.toDataURL('image/png');
  } catch {
    // Tainted or unavailable canvas — export without the background.
    return null;
  }
}

/**
 * SVG is XML, so a brand string is markup until it is escaped. Today's marks are
 * plain words, but an ampersand in a future company name would silently break
 * every watermarked document rather than fail anywhere visible.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The same tile as an SVG data URI, for CSS `background-image`.
 *
 * SVG rather than the canvas PNG because this one goes into an HTML document
 * that Word and the print dialog have to parse: text stays text, the file stays
 * small, and nothing depends on a canvas being available when the string is
 * built.
 */
export function watermarkTileSvgUri(): string {
  const lines = TILE_TEXT.map(
    (line) =>
      `<text x="${TILE.width / 2}" y="${TILE.height / 2 + line.dy}" ` +
      `font-family="Arial, Helvetica, sans-serif" font-size="${line.size}" ` +
      `font-weight="${line.weight}" fill="${TILE_INK}" text-anchor="middle">` +
      `${escapeXml(line.text)}</text>`
  ).join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.width}" height="${TILE.height}">` +
    `<g transform="rotate(${TILE.angle} ${TILE.width / 2} ${TILE.height / 2})">${lines}</g>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * How the PDF watermark is drawn. Points, since the answer sheet is built in
 * points; sizes are larger than the tile's because one mark covers a whole A4
 * page rather than repeating.
 */
export const PDF_WATERMARK = {
  /** Degrees anticlockwise from horizontal, as jsPDF measures text rotation. */
  angle: 28,
  opacity: 0.07,
  /** Brand green, as an RGB triple for `setTextColor`. */
  rgb: [15, 123, 63] as const,
  lines: [
    { text: BRANDING.name, size: 62, style: 'bold' as const, dy: -46 },
    { text: BRANDING.site, size: 30, style: 'normal' as const, dy: 6 },
    { text: BRANDING.poweredBy, size: 22, style: 'normal' as const, dy: 48 },
  ],
} as const;
