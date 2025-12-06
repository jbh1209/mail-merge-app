// ============================================================================
// DESIGN EDITOR FOUNDATION - Type Adapters
// ============================================================================
// These functions convert between the legacy FieldConfig type and the new
// DesignElement type, enabling gradual migration without breaking existing
// functionality.
// ============================================================================

import type { 
  DesignElement, 
  DesignPage, 
  DesignDocument,
  ElementKind,
  TextStyle,
  BarcodeConfig,
  QRCodeConfig,
  SequenceConfig,
  AddressBlockConfig,
  DocumentType
} from './types';

import type { FieldConfig, FieldType, Size } from '../canvas-utils';

// ============================================================================
// FIELD TYPE MAPPING
// ============================================================================

/**
 * Map legacy FieldType to new ElementKind
 */
export function fieldTypeToElementKind(fieldType: FieldType): ElementKind {
  switch (fieldType) {
    case 'text':
      return 'text';
    case 'barcode':
      return 'barcode';
    case 'qrcode':
      return 'qr';
    case 'sequence':
      return 'sequence';
    case 'address_block':
      return 'address_block';
    default:
      return 'text';
  }
}

/**
 * Map new ElementKind back to legacy FieldType
 */
export function elementKindToFieldType(kind: ElementKind): FieldType {
  switch (kind) {
    case 'text':
      return 'text';
    case 'barcode':
      return 'barcode';
    case 'qr':
      return 'qrcode';
    case 'sequence':
      return 'sequence';
    case 'address_block':
      return 'address_block';
    // These don't exist in legacy, default to text
    case 'image':
    case 'shape':
    case 'group':
      return 'text';
    default:
      return 'text';
  }
}

// ============================================================================
// FIELD CONFIG → DESIGN ELEMENT
// ============================================================================

/**
 * Convert a legacy FieldConfig to a new DesignElement
 * This enables the new editor to work with existing template data.
 */
export function fieldConfigToDesignElement(field: FieldConfig): DesignElement {
  const kind = fieldTypeToElementKind(field.fieldType);
  
  // Build base element
  const element: DesignElement = {
    id: field.id,
    kind,
    name: field.templateField,
    
    // Position and size (already in mm)
    x: field.position.x,
    y: field.position.y,
    width: field.size.width,
    height: field.size.height,
    rotation: 0,
    
    // Data binding
    dataField: field.templateField,
    isStatic: false,
    
    // Layer management
    zIndex: field.zIndex ?? 0,
    locked: field.locked ?? false,
    visible: field.visible ?? true,
    
    // Style - map from legacy format
    style: {
      fontSize: field.style.fontSize,
      fontFamily: field.style.fontFamily,
      fontWeight: field.style.fontWeight,
      fontStyle: field.style.fontStyle,
      textAlign: field.style.textAlign,
      verticalAlign: field.style.verticalAlign,
      color: field.style.color
    },
    
    // Text options
    overflow: field.overflow,
    autoFit: field.autoFit,
    maxLines: field.maxLines,
    
    // Label
    showLabel: field.showLabel,
    labelStyle: field.labelStyle
  };
  
  // Add type-specific configuration
  switch (kind) {
    case 'barcode':
      element.config = {
        format: field.typeConfig?.barcodeFormat || 'CODE128',
        showText: true,
        staticValue: field.typeConfig?.staticValue
      } as BarcodeConfig;
      break;
      
    case 'qr':
      element.config = {
        errorCorrection: field.typeConfig?.qrErrorCorrection || 'M',
        staticValue: field.typeConfig?.staticValue
      } as QRCodeConfig;
      break;
      
    case 'sequence':
      element.config = {
        startNumber: field.typeConfig?.sequenceStart || 1,
        prefix: field.typeConfig?.sequencePrefix,
        suffix: field.typeConfig?.sequenceSuffix,
        padding: field.typeConfig?.sequencePadding || 0
      } as SequenceConfig;
      break;
      
    case 'address_block':
      element.config = {
        combinedFields: field.combinedFields || [],
        separator: '\n'
      } as AddressBlockConfig;
      break;
  }
  
  return element;
}

/**
 * Convert an array of FieldConfigs to DesignElements
 */
export function fieldConfigsToDesignElements(fields: FieldConfig[]): DesignElement[] {
  return fields.map(fieldConfigToDesignElement);
}

// ============================================================================
// DESIGN ELEMENT → FIELD CONFIG
// ============================================================================

/**
 * Convert a new DesignElement back to legacy FieldConfig
 * This enables backward compatibility with existing PDF generation and storage.
 */
export function designElementToFieldConfig(element: DesignElement): FieldConfig {
  const fieldType = elementKindToFieldType(element.kind);
  
  // Build legacy field config
  const field: FieldConfig = {
    id: element.id,
    templateField: element.dataField || element.name || 'field',
    
    // Position and size
    position: {
      x: element.x,
      y: element.y
    },
    size: {
      width: element.width,
      height: element.height
    },
    
    // Style - ensure all required properties exist
    style: {
      fontSize: element.style.fontSize || 12,
      fontFamily: element.style.fontFamily || 'Arial',
      fontWeight: (element.style.fontWeight as 'normal' | 'bold') || 'normal',
      fontStyle: (element.style.fontStyle as 'normal' | 'italic') || 'normal',
      textAlign: (element.style.textAlign as 'left' | 'center' | 'right') || 'left',
      color: element.style.color || '#000000',
      verticalAlign: (element.style.verticalAlign as 'top' | 'middle' | 'bottom') || 'top'
    },
    
    // Text options
    overflow: element.overflow || 'wrap',
    autoFit: element.autoFit,
    maxLines: element.maxLines,
    
    // Label
    showLabel: element.showLabel,
    labelStyle: element.labelStyle,
    
    // Field type
    fieldType,
    
    // Layer management
    zIndex: element.zIndex,
    locked: element.locked,
    visible: element.visible
  };
  
  // Add type-specific configuration
  switch (element.kind) {
    case 'barcode': {
      const config = element.config as BarcodeConfig | undefined;
      // Map new format to legacy format (QR is handled separately as 'qr' element kind)
      const legacyFormat = config?.format === 'QR' ? 'CODE128' : (config?.format || 'CODE128');
      field.typeConfig = {
        barcodeFormat: legacyFormat as 'CODE128' | 'CODE39' | 'EAN13' | 'UPC',
        staticValue: config?.staticValue
      };
      break;
    }
    
    case 'qr': {
      const config = element.config as QRCodeConfig | undefined;
      field.typeConfig = {
        qrErrorCorrection: config?.errorCorrection || 'M',
        staticValue: config?.staticValue
      };
      break;
    }
    
    case 'sequence': {
      const config = element.config as SequenceConfig | undefined;
      field.typeConfig = {
        sequenceStart: config?.startNumber || 1,
        sequencePrefix: config?.prefix,
        sequenceSuffix: config?.suffix,
        sequencePadding: config?.padding || 0
      };
      break;
    }
    
    case 'address_block': {
      const config = element.config as AddressBlockConfig | undefined;
      field.combinedFields = config?.combinedFields || [];
      break;
    }
  }
  
  return field;
}

/**
 * Convert an array of DesignElements to FieldConfigs
 */
export function designElementsToFieldConfigs(elements: DesignElement[]): FieldConfig[] {
  return elements.map(designElementToFieldConfig);
}

// ============================================================================
// TEMPLATE DATA → DESIGN DOCUMENT
// ============================================================================

/**
 * Convert existing template data (from database) to a DesignDocument
 */
export function templateToDesignDocument(
  template: {
    id: string;
    name: string;
    width_mm?: number | null;
    height_mm?: number | null;
    bleed_mm?: number | null;
    design_config?: { fields?: FieldConfig[] } | null;
    template_type?: string;
  }
): DesignDocument {
  const fields = template.design_config?.fields || [];
  const elements = fieldConfigsToDesignElements(fields);
  
  // Map template_type to DocumentType
  let docType: DocumentType = 'custom';
  switch (template.template_type) {
    case 'uploaded_pdf':
    case 'uploaded_image':
    case 'built_in_library':
    case 'ai_generated':
      docType = 'label'; // Default to label for existing templates
      break;
  }
  
  return {
    id: template.id,
    name: template.name,
    type: docType,
    pages: [{
      id: `page-${template.id}`,
      name: 'Main',
      widthMm: template.width_mm || 100,
      heightMm: template.height_mm || 50,
      bleedMm: template.bleed_mm || 0,
      elements
    }]
  };
}

/**
 * Convert a DesignDocument back to template format for database storage
 */
export function designDocumentToTemplate(
  doc: DesignDocument
): {
  name: string;
  width_mm: number;
  height_mm: number;
  bleed_mm: number;
  design_config: { fields: FieldConfig[] };
} {
  const page = doc.pages[0]; // Currently only supporting single-page templates
  
  return {
    name: doc.name,
    width_mm: page?.widthMm || 100,
    height_mm: page?.heightMm || 50,
    bleed_mm: page?.bleedMm || 0,
    design_config: {
      fields: page ? designElementsToFieldConfigs(page.elements) : []
    }
  };
}

// ============================================================================
// PROJECT TYPE MAPPING
// ============================================================================

/**
 * Map project type enum to DocumentType
 */
export function projectTypeToDocumentType(
  projectType: 'label' | 'certificate' | 'card' | 'shelf_strip' | 'badge' | 'custom'
): DocumentType {
  switch (projectType) {
    case 'label':
      return 'label';
    case 'certificate':
      return 'certificate';
    case 'card':
      return 'card';
    case 'badge':
      return 'badge';
    case 'shelf_strip':
    case 'custom':
    default:
      return 'custom';
  }
}
