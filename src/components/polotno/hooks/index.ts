/**
 * Polotno Editor Hooks
 * 
 * Extracted hooks for the Polotno editor to improve maintainability:
 * - usePolotnoBootstrap: Bootstrap state machine and store creation
 * - useVdpNavigation: VDP record navigation and resolution
 * - useLayoutGenerator: AI-assisted layout generation
 */

export { usePolotnoBootstrap } from './usePolotnoBootstrap';
export type { 
  BootstrapStage, 
  PolotnoEditorHandle, 
  PrintExportOptions,
  UsePolotnoBootstrapOptions,
  UsePolotnoBootstrapResult,
} from './usePolotnoBootstrap';

export { useVdpNavigation } from './useVdpNavigation';
export type { 
  RecordNavigationState,
  UseVdpNavigationOptions,
  UseVdpNavigationResult,
} from './useVdpNavigation';

export { useLayoutGenerator } from './useLayoutGenerator';
export type { 
  UseLayoutGeneratorOptions,
  UseLayoutGeneratorResult,
} from './useLayoutGenerator';
