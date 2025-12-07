// =============================================================================
// DESIGN EDITOR V2 - CORE TYPES
// =============================================================================
// These types describe the design document model for the next-generation editor
// experience. All measurements remain in millimeters (mm) to stay consistent
// with print-focused workflows.
// =============================================================================

export type V2ElementKind = 'text' | 'image' | 'shape' | 'group' | 'frame';

export interface ElementTransform {
  x: number;                  // mm from left edge of page
  y: number;                  // mm from top edge of page
  width: number;              // mm
  height: number;             // mm
  rotation?: number;          // degrees, clockwise
}

export interface ElementMetadata {
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  notes?: string;
}

export interface DataBinding {
  field: string;
  samplePreview?: string;
}

export interface TextElement extends ElementTransform, ElementMetadata {
  id: string;
  kind: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;           // pt
  fontWeight?: 'normal' | 'bold' | '600' | '700';
  color?: string;             // hex color
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  binding?: DataBinding;
}

export interface ImageElement extends ElementTransform, ElementMetadata {
  id: string;
  kind: 'image';
  src: string;
  fit?: 'contain' | 'cover' | 'fill';
  borderRadius?: number;
  binding?: DataBinding;
}

export interface ShapeElement extends ElementTransform, ElementMetadata {
  id: string;
  kind: 'shape';
  shape: 'rectangle' | 'ellipse' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface FrameElement extends ElementTransform, ElementMetadata {
  id: string;
  kind: 'frame';
  children: DesignElement[];
  padding?: number;
}

export interface GroupElement extends ElementTransform, ElementMetadata {
  id: string;
  kind: 'group';
  children: DesignElement[];
}

export type DesignElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | FrameElement
  | GroupElement;

export interface DesignPageBackground {
  color?: string;
  image?: string;
  bleedMm?: number;
  marginMm?: number;
}

export interface DesignPage {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  background?: DesignPageBackground;
  elements: DesignElement[];
}

export interface DesignDocumentMetadata {
  version: 'v2';
  createdAt: string;
  updatedAt?: string;
  author?: string;
}

export interface DesignDocument {
  id: string;
  name: string;
  pages: DesignPage[];
  metadata: DesignDocumentMetadata;
}
