/**
 * The marks stamped on every document the platform hands out — the assessment
 * results workbook and the candidate answer sheet.
 *
 * Defined once. A watermark that reads one way on the spreadsheet and another on
 * the PDF is worse than none at all: the reader cannot tell which document is
 * the authentic one, which is the whole point of marking them.
 */
export const BRANDING = {
  /** Product name — the largest line of the watermark. */
  name: 'RightPath',
  /** Where a reader can verify the document came from us. */
  site: 'airightpath.com',
  /** Attribution line. */
  poweredBy: 'Powered by iSign Tech',
} as const;

/** The three marks in reading order, for a stacked watermark. */
export const BRAND_LINES: readonly string[] = [
  BRANDING.name,
  BRANDING.site,
  BRANDING.poweredBy,
];

/** The three marks on one line, for footers and single-line captions. */
export const BRAND_LINE = `${BRANDING.name}  ·  ${BRANDING.site}  ·  ${BRANDING.poweredBy}`;
