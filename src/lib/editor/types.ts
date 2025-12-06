// ============================================================================
// DESIGN EDITOR FOUNDATION - Core Type System
// ============================================================================
// This is the single source of truth for all design element types.
// All measurements are in millimeters (mm) for print accuracy.
// Font sizes are in points (pt) as per print industry standard.
// ============================================================================

/**
 * Element kinds supported by the design editor
 */
export type ElementKind = 
  | 'text' 
  | 'image' 
  | 'shape' 
  | 'qr' 
  | 'barcode' 
  | 'sequence' 
  | 'address_block'
  | 'group';

/**
 * Shape types for shape elements
 */
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'ellipse';

/**
 * Barcode format types
 */
export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'UPC' | 'QR';

/**
 * QR Code error correction levels
 */
export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Vertical alignment options
 */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Font weight options
 */
export type FontWeight = 'normal' | 'bold';

/**
 * Text overflow handling
 */
export type OverflowBehavior = 'truncate' | 'wrap' | 'shrink';

// ============================================================================
// ELEMENT STYLE INTERFACES
// ============================================================================

/**
 * Text styling properties
 */
export interface TextStyle {
  fontSize: number;          // in points (pt)
  fontFamily: string;        // e.g., 'Roboto', 'Open Sans'
  fontWeight: FontWeight;
  fontStyle: 'normal' | 'italic';
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  color: string;             // hex color e.g., '#000000'
  lineHeight?: number;       // multiplier, e.g., 1.2
  letterSpacing?: number;    // in pt
}

/**
 * Shape styling properties
 */
export interface ShapeStyle {
  fill: string;              // hex color or 'transparent'
  stroke: string;            // hex color
  strokeWidth: number;       // in mm
  opacity: number;           // 0-1
  cornerRadius?: number;     // in mm, for rectangles
}

/**
 * Image styling properties
 */
export interface ImageStyle {
  opacity: number;           // 0-1
  fit: 'contain' | 'cover' | 'fill' | 'none';
  borderRadius?: number;     // in mm
}

/**
 * Combined element style (union of all style types)
 */
export interface ElementStyle extends Partial<TextStyle>, Partial<ShapeStyle>, Partial<ImageStyle> {
  // Common properties
  opacity?: number;
}

// ============================================================================
// ELEMENT TYPE-SPECIFIC CONFIGURATION
// ============================================================================

/**
 * Configuration for barcode elements
 */
export interface BarcodeConfig {
  format: BarcodeFormat;
  showText?: boolean;        // Show human-readable text below barcode
  staticValue?: string;      // Static value (if not data-bound)
}

/**
 * Configuration for QR code elements
 */
export interface QRCodeConfig {
  errorCorrection: QRErrorCorrectionLevel;
  staticValue?: string;      // Static value (if not data-bound)
}

/**
 * Configuration for sequence elements
 */
export interface SequenceConfig {
  startNumber: number;
  prefix?: string;
  suffix?: string;
  padding: number;           // Zero-padding, e.g., 4 = 0001
}

/**
 * Configuration for address block elements
 */
export interface AddressBlockConfig {
  combinedFields: string[];  // Field names to combine
  separator?: string;        // Usually newline
}

/**
 * Configuration for shape elements
 */
export interface ShapeConfig {
  shapeType: ShapeType;
}

/**
 * Configuration for image elements
 */
export interface ImageConfig {
  src: string;               // URL or data URI
  originalWidth?: number;    // Original image width in px
  originalHeight?: number;   // Original image height in px
}

/**
 * Union type for all element configurations
 */
export type ElementTypeConfig = 
  | BarcodeConfig 
  | QRCodeConfig 
  | SequenceConfig 
  | AddressBlockConfig
  | ShapeConfig
  | ImageConfig;

// ============================================================================
// LABEL STYLE (for field labels like "Name:", "Address:")
// ============================================================================

export interface LabelStyle {
  fontSize: number;          // in pt
  color: string;             // hex color
  position: 'above' | 'inline';
}

// ============================================================================
// CORE DESIGN ELEMENT
// ============================================================================

/**
 * Core design element - the fundamental unit of a design
 * All coordinates and dimensions are in millimeters (mm)
 */
export interface DesignElement {
  id: string;
  kind: ElementKind;
  name?: string;             // Human-readable name for layers panel
  
  // Geometry in mm (single source of truth for positioning)
  x: number;                 // mm from left edge of page
  y: number;                 // mm from top edge of page
  width: number;             // mm
  height: number;            // mm
  rotation?: number;         // degrees, clockwise
  
  // VDP (Variable Data Printing) binding
  dataField?: string;        // Field name from data source, e.g., "customer_name"
  isStatic?: boolean;        // If true, content doesn't change per record
  staticContent?: string;    // Static content when not data-bound
  
  // Layer management
  zIndex: number;            // Higher = on top
  locked: boolean;           // Prevent selection/modification
  visible: boolean;          // Show/hide on canvas and in output
  
  // Styling
  style: ElementStyle;
  
  // Type-specific configuration
  config?: ElementTypeConfig;
  
  // Text-specific options
  overflow?: OverflowBehavior;
  autoFit?: boolean;         // Auto-size font to fit container
  maxLines?: number;         // Maximum lines for text wrapping
  
  // Label display (for showing field name above content)
  showLabel?: boolean;
  labelStyle?: LabelStyle;
}

// ============================================================================
// DESIGN PAGE
// ============================================================================

/**
 * A single page in a design document
 * Represents one label, one postcard, one page of a multi-page document, etc.
 */
export interface DesignPage {
  id: string;
  name?: string;             // e.g., "Front", "Back", "Page 1"
  
  // Page dimensions in mm
  widthMm: number;
  heightMm: number;
  
  // Print settings
  bleedMm?: number;          // Bleed area (typically 3mm for professional print)
  safeMarginMm?: number;     // Safe zone inside trim (typically 3-5mm)
  
  // Content
  elements: DesignElement[];
  
  // Background
  backgroundColor?: string;  // hex color, default white
  backgroundImage?: string;  // URL or data URI
}

// ============================================================================
// DESIGN DOCUMENT
// ============================================================================

/**
 * Document types supported
 */
export type DocumentType = 
  | 'label' 
  | 'postcard' 
  | 'envelope' 
  | 'badge'
  | 'certificate'
  | 'card'
  | 'custom';

/**
 * A complete design document
 * Can contain multiple pages (e.g., front/back of a postcard)
 */
export interface DesignDocument {
  id: string;
  name: string;
  type: DocumentType;
  
  // Pages
  pages: DesignPage[];
  
  // Document-level settings
  defaultFontFamily?: string;
  defaultFontSize?: number;
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PRINT CONFIGURATION
// ============================================================================

/**
 * Print output configuration
 */
export interface PrintConfig {
  // Bleed and marks
  bleedMm: number;           // Bleed extension beyond trim (typically 3mm)
  showCropMarks: boolean;    // Corner marks showing trim lines
  showRegistrationMarks: boolean;  // For color alignment
  showColorBars: boolean;    // CMYK color verification bars
  
  // PDF box settings (for professional print)
  setTrimBox: boolean;       // Set PDF TrimBox to finished size
  setBleedBox: boolean;      // Set PDF BleedBox to trim + bleed
  
  // Resolution
  rasterDPI: number;         // DPI for any rasterized elements (typically 300)
  
  // Color
  colorMode: 'rgb' | 'cmyk'; // Output color mode
}

/**
 * Default print configuration for professional output
 */
export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  bleedMm: 3,
  showCropMarks: true,
  showRegistrationMarks: false,
  showColorBars: false,
  setTrimBox: true,
  setBleedBox: true,
  rasterDPI: 300,
  colorMode: 'rgb'
};

// ============================================================================
// EDITOR STATE
// ============================================================================

/**
 * Current editor state (for UI components)
 */
export interface EditorState {
  // Current document
  document: DesignDocument | null;
  activePageId: string | null;
  
  // Selection
  selectedElementIds: string[];
  
  // View
  zoom: number;              // 1 = 100%, 2 = 200%, etc.
  panX: number;              // Pan offset in pixels
  panY: number;
  
  // Grid and snapping
  showGrid: boolean;
  gridSizeMm: number;        // Grid spacing in mm
  snapToGrid: boolean;
  snapToElements: boolean;
  
  // Tools
  activeTool: 'select' | 'pan' | 'text' | 'shape' | 'zoom';
  
  // History
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Default editor state
 */
export const DEFAULT_EDITOR_STATE: EditorState = {
  document: null,
  activePageId: null,
  selectedElementIds: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridSizeMm: 1,
  snapToGrid: true,
  snapToElements: true,
  activeTool: 'select',
  canUndo: false,
  canRedo: false
};
