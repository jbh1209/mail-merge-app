// Polotno-specific types for the design editor

export interface PolotnoElementCustom {
  /** VDP variable field name */
  variable?: string;
  /** Sequence number configuration */
  sequenceConfig?: SequenceConfig;
  /** Barcode/QR configuration */
  barcodeConfig?: BarcodeConfig;
  /** Resolved barcode value for current record */
  barcodeValue?: string;
}

export interface SequenceConfig {
  startNumber: number;
  prefix?: string;
  suffix?: string;
  padding?: number;
}

export interface BarcodeConfig {
  type: 'barcode' | 'qrcode';
  format: string; // 'code128', 'code39', 'ean13', 'qrcode', etc.
  dataSource: 'static' | 'field';
  staticValue?: string;
  variableField?: string;
}

export interface PolotnoScene {
  width: number;
  height: number;
  fonts: Array<{ fontFamily: string; url?: string }>;
  pages: PolotnoPage[];
  unit?: string;
  dpi?: number;
}

export interface PolotnoPage {
  id: string;
  children: PolotnoElement[];
  background?: string;
  bleed?: number;
  custom?: Record<string, unknown>;
}

export interface PolotnoElement {
  id: string;
  type: 'text' | 'image' | 'svg' | 'line' | 'figure';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  custom?: PolotnoElementCustom;

  // Common paint/stroke properties (used by line/figure/svg)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];

  // Text-specific
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: string;
  align?: string;

  // Image-specific
  src?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;

  // SVG-specific
  svgSource?: string;
}

export interface ExportOptions {
  format: 'pdf' | 'png' | 'jpeg';
  dpi?: number;
  includeBleed?: boolean;
  cropMarkSize?: number;
  unit?: 'mm' | 'cm' | 'in' | 'pt' | 'px';
  pixelRatio?: number;
  fileName?: string;
}

export interface BatchExportProgress {
  phase: 'exporting' | 'uploading' | 'composing' | 'complete';
  current: number;
  total: number;
  message?: string;
}

export interface BatchExportResult {
  success: boolean;
  outputUrl?: string;
  pageCount: number;
  error?: string;
}
