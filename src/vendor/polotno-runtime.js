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
 */
export function configureBleed(store, bleedPx) {
  if (bleedPx > 0 && store.activePage) {
    store.activePage.set({ bleed: bleedPx });
    store.toggleBleed(true);
  }
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
