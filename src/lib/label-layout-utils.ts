// Label pagination and layout calculation utilities

export interface LayoutConfig {
  labelWidth: number;  // in mm
  labelHeight: number; // in mm
  columns: number;
  rows: number;
  marginTop: number;   // in mm
  marginLeft: number;  // in mm
  horizontalGap: number; // in mm
  verticalGap: number; // in mm
  labelsPerPage: number;
}

export interface LabelPosition {
  x: number; // in mm
  y: number; // in mm
  pageIndex: number;
  labelIndexOnPage: number;
}

/**
 * Get labels per page based on template configuration
 */
export function getLabelsPerPage(template: any): number {
  // For Avery 5160: 3 columns × 10 rows = 30 labels
  if (template.template_type === 'built_in_library') {
    return 30; // Avery 5160 default
  }

  // Calculate based on template dimensions
  const pageWidth = 215.9; // A4 width in mm
  const pageHeight = 279.4; // A4 height in mm
  
  const labelWidth = template.width_mm || 66.68;
  const labelHeight = template.height_mm || 25.4;
  
  const marginTop = 12.7;
  const marginLeft = 4.76;
  const horizontalGap = 3.18;
  const verticalGap = 0;
  
  const columns = Math.floor((pageWidth - marginLeft) / (labelWidth + horizontalGap));
  const rows = Math.floor((pageHeight - marginTop) / (labelHeight + verticalGap));
  
  return Math.max(columns * rows, 1);
}

/**
 * Calculate detailed label layout for a template
 */
export function calculateLayout(template: any): LayoutConfig {
  const labelWidth = template.width_mm || 66.68;
  const labelHeight = template.height_mm || 25.4;
  
  const marginTop = 12.7;
  const marginLeft = 4.76;
  const horizontalGap = 3.18;
  const verticalGap = 0;
  
  const pageWidth = 215.9; // A4/Letter width
  const columns = Math.floor((pageWidth - marginLeft) / (labelWidth + horizontalGap));
  
  const pageHeight = 279.4; // A4/Letter height  
  const rows = Math.floor((pageHeight - marginTop) / (labelHeight + verticalGap));
  
  return {
    labelWidth,
    labelHeight,
    columns: Math.max(columns, 1),
    rows: Math.max(rows, 1),
    marginTop,
    marginLeft,
    horizontalGap,
    verticalGap,
    labelsPerPage: Math.max(columns * rows, 1)
  };
}

/**
 * Split data rows into pages based on labels per page
 */
export function paginateData<T>(
  rows: T[],
  labelsPerPage: number
): T[][] {
  const pages: T[][] = [];
  
  for (let i = 0; i < rows.length; i += labelsPerPage) {
    pages.push(rows.slice(i, i + labelsPerPage));
  }
  
  return pages;
}

/**
 * Calculate position for a specific label on a page
 */
export function getLabelPosition(
  labelIndexOnPage: number,
  layout: LayoutConfig
): { x: number; y: number } {
  const row = Math.floor(labelIndexOnPage / layout.columns);
  const col = labelIndexOnPage % layout.columns;
  
  const x = layout.marginLeft + (col * (layout.labelWidth + layout.horizontalGap));
  const y = layout.marginTop + (row * (layout.labelHeight + layout.verticalGap));
  
  return { x, y };
}

/**
 * Calculate position for a specific label across all pages
 */
export function getAbsoluteLabelPosition(
  absoluteLabelIndex: number,
  layout: LayoutConfig
): LabelPosition {
  const pageIndex = Math.floor(absoluteLabelIndex / layout.labelsPerPage);
  const labelIndexOnPage = absoluteLabelIndex % layout.labelsPerPage;
  
  const position = getLabelPosition(labelIndexOnPage, layout);
  
  return {
    ...position,
    pageIndex,
    labelIndexOnPage
  };
}

/**
 * Calculate total number of pages needed for dataset
 */
export function calculateTotalPages(
  rowCount: number,
  labelsPerPage: number
): number {
  return Math.ceil(rowCount / labelsPerPage);
}

/**
 * Get data rows for a specific page
 */
export function getPageData<T>(
  allRows: T[],
  pageIndex: number,
  labelsPerPage: number
): T[] {
  const start = pageIndex * labelsPerPage;
  const end = start + labelsPerPage;
  return allRows.slice(start, end);
}

/**
 * Convert page and label index to absolute label index
 */
export function toAbsoluteLabelIndex(
  pageIndex: number,
  labelIndexOnPage: number,
  labelsPerPage: number
): number {
  return (pageIndex * labelsPerPage) + labelIndexOnPage;
}
