/**
 * Polotno Runtime Bridge
 * 
 * This file is intentionally plain JavaScript (not TypeScript) to prevent
 * the TypeScript compiler from attempting to resolve Polotno's complex type
 * definitions, which cause stack overflow errors in the Go-based typechecker.
 * 
 * All Polotno imports are isolated here and exposed via simple factory functions.
 */

// Lazy-loaded modules
let polotnoModules = null;

/**
 * Dynamically load all Polotno modules.
 * Returns a promise that resolves to an object containing all necessary modules.
 */
export async function loadPolotnoModules() {
  if (polotnoModules) return polotnoModules;

  const [
    polotnoStore,
    polotnoCore,
    toolbar,
    timeline,
    zoom,
    sidePanel,
    workspace,
  ] = await Promise.all([
    import('polotno/model/store'),
    import('polotno'),
    import('polotno/toolbar/toolbar'),
    import('polotno/pages-timeline'),
    import('polotno/toolbar/zoom-buttons'),
    import('polotno/side-panel'),
    import('polotno/canvas/workspace'),
  ]);

  // Import Blueprint CSS (required by Polotno)
  await import('@blueprintjs/core/lib/css/blueprint.css');

  polotnoModules = {
    createStore: polotnoStore.createStore,
    PolotnoContainer: polotnoCore.PolotnoContainer,
    SidePanelWrap: polotnoCore.SidePanelWrap,
    WorkspaceWrap: polotnoCore.WorkspaceWrap,
    Toolbar: toolbar.Toolbar,
    PagesTimeline: timeline.PagesTimeline,
    ZoomButtons: zoom.ZoomButtons,
    SidePanel: sidePanel.SidePanel,
    SectionTab: sidePanel.SectionTab,
    DEFAULT_SECTIONS: sidePanel.DEFAULT_SECTIONS,
    Workspace: workspace.Workspace,
  };

  return polotnoModules;
}

/**
 * Create a new Polotno store with the given configuration.
 */
export async function createPolotnoStore(options) {
  const modules = await loadPolotnoModules();
  const store = modules.createStore({
    key: options.apiKey,
    showCredit: false,
  });

  store.setUnit({ unit: options.unit || 'mm', dpi: options.dpi || 300 });
  
  if (options.width && options.height) {
    store.setSize(options.width, options.height);
  }

  if (store.pages.length === 0) {
    store.addPage();
  }

  return store;
}

/**
 * Configure bleed settings on a store.
 * @param {object} store - Polotno store instance
 * @param {number} bleedPx - Bleed size in pixels
 * @param {boolean} showBleed - Whether to show bleed visualization in editor
 */
export function configureBleed(store, bleedPx, showBleed = true) {
  if (bleedPx > 0 && store.activePage) {
    store.activePage.set({ bleed: bleedPx });
    if (showBleed) {
      store.toggleBleed(true);
    }
  }
}

/**
 * Toggle bleed visualization on/off in the editor.
 * @param {object} store - Polotno store instance
 * @param {boolean} show - Whether to show bleed
 */
export function toggleBleedVisibility(store, show) {
  store.toggleBleed(show);
}

/**
 * Export the store as a PDF blob WITHOUT triggering browser download.
 * Uses toPDFDataURL() which returns base64, then converts to Blob.
 * 
 * @param {object} store - Polotno store instance
 * @param {object} options - Export options
 * @param {boolean} options.includeBleed - Include bleed area in export
 * @param {number} options.cropMarkSize - Size of crop marks in pixels (0 = no marks)
 * @param {number} options.pixelRatio - Quality multiplier (1-3)
 * @returns {Promise<Blob>} PDF blob (no download triggered)
 */
export async function exportToPdf(store, options = {}) {
  const {
    includeBleed = true,
    cropMarkSize = 0,
    pixelRatio = 2,
  } = options;

  // Use toPDFDataURL instead of saveAsPDF to avoid triggering browser download
  const dataUrl = await store.toPDFDataURL({
    includeBleed,
    cropMarkSize,
    pixelRatio,
    dpi: 300,
  });

  // Convert base64 data URL to Blob
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Calculate bleed size in pixels from mm, using DPI.
 * @param {number} mm - Size in millimeters
 * @param {number} dpi - Dots per inch (default 300)
 * @returns {number} Size in pixels
 */
export function mmToPixels(mm, dpi = 300) {
  return (mm / 25.4) * dpi;
}

/**
 * Calculate crop mark size in pixels from mm.
 * @param {number} mm - Crop mark size in mm (typically 3mm)
 * @param {number} dpi - Dots per inch (default 300)
 * @returns {number} Size in pixels
 */
export function cropMarkMmToPixels(mm, dpi = 300) {
  return mmToPixels(mm, dpi);
}

/**
 * Load a scene JSON into the store.
 */
export function loadScene(store, sceneJson) {
  if (!sceneJson) return false;
  try {
    const parsed = typeof sceneJson === 'string' ? JSON.parse(sceneJson) : sceneJson;
    store.loadJSON(parsed);
    return true;
  } catch (e) {
    console.warn('Could not load scene:', e);
    return false;
  }
}

/**
 * Export the current store state as a JSON string.
 */
export function saveScene(store) {
  return JSON.stringify(store.toJSON());
}

/**
 * Get the Polotno UI components for rendering.
 * Must be called after loadPolotnoModules().
 */
export function getPolotnoComponents() {
  if (!polotnoModules) {
    throw new Error('Polotno modules not loaded. Call loadPolotnoModules() first.');
  }
  return polotnoModules;
}

/**
 * Get the SectionTab component for custom panels.
 */
export function getSectionTab() {
  if (!polotnoModules) {
    throw new Error('Polotno modules not loaded. Call loadPolotnoModules() first.');
  }
  return polotnoModules.SectionTab;
}

/**
 * Create a custom section definition for the side panel.
 * @param {string} name - Section identifier
 * @param {React.ComponentType} TabComponent - Component to render in the tab
 * @param {React.ComponentType} PanelComponent - Component to render in the panel
 */
export function createCustomSection(name, TabComponent, PanelComponent) {
  if (!polotnoModules) {
    throw new Error('Polotno modules not loaded. Call loadPolotnoModules() first.');
  }
  const { SectionTab } = polotnoModules;
  
  return {
    name,
    Tab: (props) => {
      const React = require('react');
      return React.createElement(SectionTab, { name, ...props }, 
        React.createElement(TabComponent));
    },
    Panel: PanelComponent,
  };
}

/**
 * Build sections array with custom VDP sections prepended to defaults.
 * @param {Array} customSections - Array of custom section objects
 */
export function buildSectionsWithCustom(customSections) {
  if (!polotnoModules) {
    throw new Error('Polotno modules not loaded. Call loadPolotnoModules() first.');
  }
  
  // Filter default sections to only include useful ones
  const defaultSections = polotnoModules.DEFAULT_SECTIONS.filter(
    section => ['text', 'photos', 'elements', 'upload', 'background', 'layers'].includes(section.name)
  );
  
  return [...customSections, ...defaultSections];
}
