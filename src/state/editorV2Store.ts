// =============================================================================
// DESIGN EDITOR V2 - STATE STORE (LOCAL HOOK)
// =============================================================================
// Centralized state for the experimental V2 editor. This implementation avoids
// external dependencies while mirroring the small API surface we previously had
// with Zustand.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import type { DesignDocument, DesignElement, DesignPage } from '@/lib/editor-v2/types';

export interface EditorV2State {
  document: DesignDocument | null;
  activePageId: string | null;
  selectedElementIds: string[];
  zoom: number;
  showGrid: boolean;

  setDocument: (doc: DesignDocument) => void;
  setActivePage: (pageId: string) => void;
  setSelection: (ids: string[]) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;

  addPage: (page: DesignPage) => void;
  updatePage: (pageId: string, updates: Partial<DesignPage>) => void;
  addElement: (pageId: string, element: DesignElement) => void;
  updateElement: (pageId: string, elementId: string, updates: Partial<DesignElement>) => void;
  removeElement: (pageId: string, elementId: string) => void;
}

export function useEditorV2Store(): EditorV2State {
  const [document, setDocumentState] = useState<DesignDocument | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [zoom, setZoomState] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  const setDocument = useCallback((doc: DesignDocument) => {
    setDocumentState(doc);
    setActivePageId(doc.pages[0]?.id ?? null);
    setSelectedElementIds([]);
  }, []);

  const setActivePage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setSelectedElementIds([]);
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    setSelectedElementIds(ids);
  }, []);

  const setZoom = useCallback((nextZoom: number) => {
    setZoomState(nextZoom);
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid(current => !current);
  }, []);

  const addPage = useCallback((page: DesignPage) => {
    setDocumentState(current => {
      if (!current) return current;
      const pages = [...current.pages, page];
      setActivePageId(page.id);
      return { ...current, pages };
    });
  }, []);

  const updatePage = useCallback((pageId: string, updates: Partial<DesignPage>) => {
    setDocumentState(current => {
      if (!current) return current;
      const pages = current.pages.map(page => (page.id === pageId ? { ...page, ...updates } : page));
      return { ...current, pages };
    });
  }, []);

  const addElement = useCallback((pageId: string, element: DesignElement) => {
    setDocumentState(current => {
      if (!current) return current;
      const pages = current.pages.map(page =>
        page.id === pageId ? { ...page, elements: [...page.elements, element] } : page
      );
      setSelectedElementIds([element.id]);
      return { ...current, pages };
    });
  }, []);

  const updateElement = useCallback(
    (pageId: string, elementId: string, updates: Partial<DesignElement>) => {
      setDocumentState(current => {
        if (!current) return current;
        const pages = current.pages.map(page => {
          if (page.id !== pageId) return page;
          const elements = page.elements.map(element => (element.id === elementId ? { ...element, ...updates } : element));
          return { ...page, elements };
        });
        return { ...current, pages };
      });
    },
    []
  );

  const removeElement = useCallback((pageId: string, elementId: string) => {
    setDocumentState(current => {
      if (!current) return current;
      const pages = current.pages.map(page => {
        if (page.id !== pageId) return page;
        return { ...page, elements: page.elements.filter(el => el.id !== elementId) };
      });
      setSelectedElementIds([]);
      return { ...current, pages };
    });
  }, []);

  return useMemo(
    () => ({
      document,
      activePageId,
      selectedElementIds,
      zoom,
      showGrid,
      setDocument,
      setActivePage,
      setSelection,
      setZoom,
      toggleGrid,
      addPage,
      updatePage,
      addElement,
      updateElement,
      removeElement
    }),
    [
      document,
      activePageId,
      selectedElementIds,
      zoom,
      showGrid,
      setDocument,
      setActivePage,
      setSelection,
      setZoom,
      toggleGrid,
      addPage,
      updatePage,
      addElement,
      updateElement,
      removeElement
    ]
  );
}
