/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Ref handle exposed to parent for imperative actions
export interface PolotnoEditorHandle {
  saveScene: () => Promise<string>;
  store: any;
}

// Record navigation state exposed to parent
export interface RecordNavigationState {
  currentIndex: number;
  totalRecords: number;
  goToNext: () => void;
  goToPrevious: () => void;
}

interface PolotnoEditorWrapperProps {
  availableFields?: string[];
  sampleData?: Record<string, string>;
  allSampleData?: Record<string, string>[];
  initialScene?: string;
  onSave?: (sceneString: string) => void;
  onSceneChange?: (hasChanges: boolean) => void;
  onReady?: (handle: PolotnoEditorHandle) => void;
  onRecordNavigationChange?: (state: RecordNavigationState) => void;
  labelWidth?: number;
  labelHeight?: number;
  bleedMm?: number;
  projectType?: string;
  projectImages?: { name: string; url: string }[];
  trimGuideMm?: { width: number; height: number; bleedMm: number };
}

const mmToPixels = (mm: number, dpi = 300) => (mm / 25.4) * dpi;

export function PolotnoEditorWrapper({
  allSampleData = [],
  initialScene,
  onSave,
  onSceneChange,
  onReady,
  onRecordNavigationChange,
  labelWidth = 100,
  labelHeight = 50,
  bleedMm = 0,
  projectImages = [],
}: PolotnoEditorWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const lastSavedSceneRef = useRef<string>('');

  useEffect(() => {
    let mounted = true;
    let store: any = null;

    const init = async () => {
      try {
        const apiKey = import.meta.env.VITE_POLOTNO_API_KEY;
        if (!apiKey) {
          setError('Polotno API key not configured');
          setIsLoading(false);
          return;
        }

        // Dynamic imports to avoid TypeScript complexity
        const polotnoStore = await import('polotno/model/store');
        const polotno = await import('polotno');
        const toolbar = await import('polotno/toolbar/toolbar');
        const timeline = await import('polotno/pages-timeline');
        const zoom = await import('polotno/toolbar/zoom-buttons');
        const sidePanel = await import('polotno/side-panel');
        const workspace = await import('polotno/canvas/workspace');
        const React = await import('react');
        const ReactDOM = await import('react-dom/client');

        // Blueprint CSS
        await import('@blueprintjs/core/lib/css/blueprint.css');

        if (!mounted) return;

        store = polotnoStore.createStore({ key: apiKey, showCredit: false });
        store.setUnit({ unit: 'mm', dpi: 300 });
        store.setSize(mmToPixels(labelWidth), mmToPixels(labelHeight));
        
        if (store.pages.length === 0) store.addPage();
        if (bleedMm > 0) {
          store.activePage?.set({ bleed: mmToPixels(bleedMm) });
          store.toggleBleed(true);
        }

        if (initialScene) {
          try {
            store.loadJSON(JSON.parse(initialScene));
            lastSavedSceneRef.current = initialScene;
          } catch (e) {
            console.warn('Could not load initial scene:', e);
          }
        }

        storeRef.current = store;

        // Render Polotno UI
        if (editorRef.current) {
          const { PolotnoContainer, SidePanelWrap, WorkspaceWrap } = polotno;
          const { Toolbar } = toolbar;
          const { PagesTimeline } = timeline;
          const { ZoomButtons } = zoom;
          const { SidePanel, DEFAULT_SECTIONS } = sidePanel;
          const { Workspace } = workspace;

          const root = ReactDOM.createRoot(editorRef.current);
          root.render(
            React.createElement(PolotnoContainer, { style: { width: '100%', height: '100%' } },
              React.createElement(SidePanelWrap, null,
                React.createElement(SidePanel, { store, sections: DEFAULT_SECTIONS })
              ),
              React.createElement(WorkspaceWrap, null,
                React.createElement(Toolbar, { store }),
                React.createElement(Workspace, { store, backgroundColor: '#f0f0f0' }),
                React.createElement(ZoomButtons, { store }),
                React.createElement(PagesTimeline, { store })
              )
            )
          );
        }

        const handle: PolotnoEditorHandle = {
          saveScene: async () => {
            const json = JSON.stringify(store.toJSON());
            onSave?.(json);
            lastSavedSceneRef.current = json;
            return json;
          },
          store,
        };

        onReady?.(handle);
        setIsLoading(false);

        // Track changes
        const interval = setInterval(() => {
          if (!store) return;
          const current = JSON.stringify(store.toJSON());
          onSceneChange?.(current !== lastSavedSceneRef.current);
        }, 1000);

        return () => clearInterval(interval);
      } catch (e) {
        console.error('Polotno init error:', e);
        setError('Failed to initialize editor');
        setIsLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [labelWidth, labelHeight, bleedMm, initialScene, onSave, onSceneChange, onReady]);

  const goToNext = useCallback(() => {
    if (currentRecordIndex < allSampleData.length - 1) setCurrentRecordIndex(i => i + 1);
  }, [currentRecordIndex, allSampleData.length]);

  const goToPrev = useCallback(() => {
    if (currentRecordIndex > 0) setCurrentRecordIndex(i => i - 1);
  }, [currentRecordIndex]);

  useEffect(() => {
    if (onRecordNavigationChange && allSampleData.length > 0) {
      onRecordNavigationChange({
        currentIndex: currentRecordIndex,
        totalRecords: allSampleData.length,
        goToNext: goToNext,
        goToPrevious: goToPrev,
      });
    }
  }, [currentRecordIndex, allSampleData.length, goToNext, goToPrev, onRecordNavigationChange]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-sm text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {allSampleData.length > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-lg border shadow-sm px-3 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev} disabled={currentRecordIndex === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums">Record {currentRecordIndex + 1} / {allSampleData.length}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext} disabled={currentRecordIndex === allSampleData.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div ref={editorRef} className="h-full w-full" />
    </div>
  );
}

export default PolotnoEditorWrapper;
