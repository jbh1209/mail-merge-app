// ============================================================================
// POLOTNO EDITOR COMPONENTS - Public API
// ============================================================================

export { PolotnoEditorWrapper } from './PolotnoEditorWrapper';
export type { 
  PolotnoEditorHandle, 
  RecordNavigationState, 
  PrintExportOptions 
} from './PolotnoEditorWrapper';

// Extracted hooks for advanced usage
export {
  usePolotnoBootstrap,
  useVdpNavigation,
  useLayoutGenerator,
} from './hooks';
export type {
  BootstrapStage,
  UsePolotnoBootstrapOptions,
  UsePolotnoBootstrapResult,
  UseVdpNavigationOptions,
  UseVdpNavigationResult,
  UseLayoutGeneratorOptions,
  UseLayoutGeneratorResult,
} from './hooks';

// Custom panels (React components, no polotno imports)
export { VdpFieldsPanel } from './panels/VdpFieldsPanel';
export { BarcodePanel } from './panels/BarcodePanel';
export { ProjectImagesPanel } from './panels/ProjectImagesPanel';
export { SequencePanel } from './panels/SequencePanel';

// VDP Variable Resolution
export {
  resolveVdpVariables,
  applyVdpToStore,
  extractUsedFields,
  batchResolveVdp,
} from '@/lib/polotno/vdpResolver';
export type { VdpResolveOptions } from '@/lib/polotno/vdpResolver';

// Batch PDF Export
export {
  batchExportWithPolotno,
  getLayoutFromPartNumber,
} from '@/lib/polotno/pdfBatchExporter';
export type {
  BatchExportProgress,
  BatchExportOptions,
  BatchExportResult,
  AveryLayoutConfig,
  PrintConfig,
} from '@/lib/polotno/pdfBatchExporter';

// Vector PDF Export
export {
  isVectorServiceAvailable,
  exportMultiPagePdf,
  exportLabelsWithImposition,
  exportVectorPdf,
} from '@/lib/polotno/vectorPdfExporter';
export type {
  VectorExportOptions,
  MultiPageExportResult,
  LabelExportResult,
} from '@/lib/polotno/vectorPdfExporter';

// PDF Generator Component
export { PolotnoPdfGenerator } from './PolotnoPdfGenerator';

// Types
export type { 
  PolotnoScene, 
  PolotnoPage, 
  PolotnoElement,
  PolotnoElementCustom,
  BarcodeConfig,
  SequenceConfig,
} from '@/lib/polotno/types';
