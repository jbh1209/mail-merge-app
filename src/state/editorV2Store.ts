// =============================================================================
// DESIGN EDITOR V2 - STATE STORE
// =============================================================================
// Centralized state management for the V2 editor using Zustand for proper
// singleton behavior across components.
// =============================================================================

import { create } from 'zustand';
import type { DesignDocument, DesignElement, DesignPage } from '@/lib/editor-v2/types';

export interface EditorV2State {
  document: DesignDocument | null;
  activePageId: string | null;
  selectedElementIds: string[];
  zoom: number;
  showGrid: boolean;
  clipboardElements: DesignElement[];

  // Actions
  setDocument: (doc: DesignDocument) => void;
  setActivePage: (pageId: string) => void;
  setSelection: (ids: string[]) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;

  // Page operations
  addPage: (page: DesignPage) => void;
  updatePage: (pageId: string, updates: Partial<DesignPage>) => void;
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => void;

  // Element operations
  addElement: (pageId: string, element: DesignElement) => void;
  updateElement: (pageId: string, elementId: string, updates: Partial<DesignElement>) => void;
  removeElement: (pageId: string, elementId: string) => void;

  // Clipboard operations
  copySelectedElements: () => void;
  pasteElements: () => void;
  deleteSelectedElements: () => void;
}

export const useEditorV2Store = create<EditorV2State>((set, get) => ({
  document: null,
  activePageId: null,
  selectedElementIds: [],
  zoom: 1,
  showGrid: true,
  clipboardElements: [],

  setDocument: (doc) => {
    set({
      document: doc,
      activePageId: doc.pages[0]?.id ?? null,
      selectedElementIds: []
    });
  },

  setActivePage: (pageId) => {
    set({
      activePageId: pageId,
      selectedElementIds: []
    });
  },

  setSelection: (ids) => {
    set({ selectedElementIds: ids });
  },

  setZoom: (zoom) => {
    set({ zoom: Math.max(0.25, Math.min(4, zoom)) });
  },

  toggleGrid: () => {
    set((state) => ({ showGrid: !state.showGrid }));
  },

  addPage: (page) => {
    set((state) => {
      if (!state.document) return state;
      return {
        document: {
          ...state.document,
          pages: [...state.document.pages, page]
        },
        activePageId: page.id
      };
    });
  },

  updatePage: (pageId, updates) => {
    set((state) => {
      if (!state.document) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page =>
            page.id === pageId ? { ...page, ...updates } : page
          )
        }
      };
    });
  },

  deletePage: (pageId) => {
    set((state) => {
      if (!state.document || state.document.pages.length <= 1) return state;
      const newPages = state.document.pages.filter(p => p.id !== pageId);
      const newActiveId = state.activePageId === pageId
        ? newPages[0]?.id ?? null
        : state.activePageId;
      return {
        document: { ...state.document, pages: newPages },
        activePageId: newActiveId,
        selectedElementIds: []
      };
    });
  },

  duplicatePage: (pageId) => {
    set((state) => {
      if (!state.document) return state;
      const page = state.document.pages.find(p => p.id === pageId);
      if (!page) return state;

      const newPage: DesignPage = {
        ...structuredClone(page),
        id: crypto.randomUUID(),
        name: `${page.name} (Copy)`,
        elements: page.elements.map(el => ({
          ...structuredClone(el),
          id: crypto.randomUUID()
        })) as DesignElement[]
      };

      const pageIndex = state.document.pages.findIndex(p => p.id === pageId);
      const newPages = [...state.document.pages];
      newPages.splice(pageIndex + 1, 0, newPage);

      return {
        document: { ...state.document, pages: newPages },
        activePageId: newPage.id
      };
    });
  },

  addElement: (pageId, element) => {
    set((state) => {
      if (!state.document) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page =>
            page.id === pageId
              ? { ...page, elements: [...page.elements, element] }
              : page
          )
        },
        selectedElementIds: [element.id]
      };
    });
  },

  updateElement: (pageId, elementId, updates) => {
    set((state) => {
      if (!state.document) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page => {
            if (page.id !== pageId) return page;
            return {
              ...page,
              elements: page.elements.map(el =>
                el.id === elementId ? { ...el, ...updates } as DesignElement : el
              )
            };
          })
        }
      };
    });
  },

  removeElement: (pageId, elementId) => {
    set((state) => {
      if (!state.document) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page => {
            if (page.id !== pageId) return page;
            return {
              ...page,
              elements: page.elements.filter(el => el.id !== elementId)
            };
          })
        },
        selectedElementIds: state.selectedElementIds.filter(id => id !== elementId)
      };
    });
  },

  copySelectedElements: () => {
    const state = get();
    if (!state.document || !state.activePageId) return;

    const page = state.document.pages.find(p => p.id === state.activePageId);
    if (!page) return;

    const elements = page.elements.filter(el =>
      state.selectedElementIds.includes(el.id)
    );

    set({ clipboardElements: structuredClone(elements) as DesignElement[] });
  },

  pasteElements: () => {
    const state = get();
    if (!state.document || !state.activePageId || state.clipboardElements.length === 0) return;

    const newElements = state.clipboardElements.map(el => ({
      ...structuredClone(el),
      id: crypto.randomUUID(),
      x: el.x + 5,
      y: el.y + 5
    })) as DesignElement[];

    set((state) => {
      if (!state.document || !state.activePageId) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page =>
            page.id === state.activePageId
              ? { ...page, elements: [...page.elements, ...newElements] }
              : page
          )
        },
        selectedElementIds: newElements.map(el => el.id)
      };
    });
  },

  deleteSelectedElements: () => {
    const state = get();
    if (!state.document || !state.activePageId) return;

    set((state) => {
      if (!state.document || !state.activePageId) return state;
      return {
        document: {
          ...state.document,
          pages: state.document.pages.map(page => {
            if (page.id !== state.activePageId) return page;
            return {
              ...page,
              elements: page.elements.filter(
                el => !state.selectedElementIds.includes(el.id)
              )
            };
          })
        },
        selectedElementIds: []
      };
    });
  }
}));