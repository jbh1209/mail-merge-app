// ============================================================================
// DESIGN EDITOR - Public API
// ============================================================================
// This is the main entry point for the design editor module.
// Import from '@/lib/editor' to access all editor types and utilities.
// ============================================================================

// Core types
export type {
  // Element types
  ElementKind,
  ShapeType,
  BarcodeFormat,
  QRErrorCorrectionLevel,
  TextAlign,
  VerticalAlign,
  FontWeight,
  OverflowBehavior,
  
  // Style interfaces
  TextStyle,
  ShapeStyle,
  ImageStyle,
  ElementStyle,
  
  // Element config interfaces
  BarcodeConfig,
  QRCodeConfig,
  SequenceConfig,
  AddressBlockConfig,
  ShapeConfig,
  ImageConfig,
  ElementTypeConfig,
  LabelStyle,
  
  // Core entities
  DesignElement,
  DesignPage,
  DesignDocument,
  DocumentType,
  
  // Print
  PrintConfig,
  
  // Editor state
  EditorState
} from './types';

// Default values
export {
  DEFAULT_PRINT_CONFIG,
  DEFAULT_EDITOR_STATE
} from './types';

// Engine interface
export type {
  CanvasEngine,
  CanvasEngineOptions,
  SelectionChangeEvent,
  ElementChangeEvent,
  ExportOptions,
  SVGExportResult,
  RasterExportResult,
  ZoomPreset
} from './engine';

export {
  DEFAULT_ENGINE_OPTIONS
} from './engine';

// Adapters for legacy compatibility
export {
  // Type mapping
  fieldTypeToElementKind,
  elementKindToFieldType,
  
  // Single conversions
  fieldConfigToDesignElement,
  designElementToFieldConfig,
  
  // Batch conversions
  fieldConfigsToDesignElements,
  designElementsToFieldConfigs,
  
  // Document conversions
  templateToDesignDocument,
  designDocumentToTemplate,
  
  // Project type mapping
  projectTypeToDocumentType
} from './adapters';
