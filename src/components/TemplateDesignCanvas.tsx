import { useRef, useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FieldElement } from './canvas/FieldElement';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { useCanvasState } from '@/hooks/useCanvasState';
import { mmToPx } from '@/lib/canvas-utils';
import { CheckCircle2, Info, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { detectTextOverflow } from '@/lib/text-measurement-utils';

interface TemplateDesignCanvasProps {
  templateSize: { width: number; height: number };
  templateName: string;
  fieldNames: string[];
  sampleData?: Record<string, any>[];
  initialDesignConfig?: any;
  onSave: (designConfig: any) => void;
  onCancel: () => void;
  stepInfo?: { current: number; total: number };
  templateId?: string;
  dataSourceId?: string;
  projectId?: string;
}

export function TemplateDesignCanvas({
  templateSize,
  templateName,
  fieldNames,
  sampleData,
  initialDesignConfig,
  onSave,
  onCancel,
  stepInfo,
  templateId,
  dataSourceId,
  projectId
}: TemplateDesignCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const [currentDataIndex, setCurrentDataIndex] = useState(0);
  const [isAutoLayoutLoading, setIsAutoLayoutLoading] = useState(false);

  const {
    fields,
    selectedFieldId,
    settings,
    setSelectedFieldId,
    moveField,
    resizeField,
    updateFieldStyle,
    updateSettings,
    autoLayout: autoLayoutFn,
    deleteField,
    toggleFieldLabels,
    toggleAllFieldLabels,
    updateFieldType,
    undo,
    redo,
    canUndo,
    canRedo,
    finalizeFieldPositions
  } = useCanvasState({ 
    templateSize, 
    initialFields: fieldNames,
    initialDesignConfig,
    sampleData
  });

  const handleAutoLayout = async () => {
    console.log('🎨 AI AUTO-LAYOUT TRIGGERED:', {
      templateSize,
      fieldCount: fields.length,
      sampleDataAvailable: !!sampleData,
      sampleRowCount: sampleData?.length || 0
    });
    
    setIsAutoLayoutLoading(true);
    const result = await autoLayoutFn();
    setIsAutoLayoutLoading(false);
    
    console.log('📊 AI LAYOUT RESULT:', {
      success: result.success,
      strategy: result.strategy,
      error: result.error,
      newFieldCount: fields.length
    });
    
    if (result.success) {
      toast({
        title: "AI Layout Applied",
        description: result.strategy,
      });
    } else {
      toast({
        title: "AI Layout Failed",
        description: `${result.error}. Using fallback layout.`,
        variant: "destructive"
      });
    }
  };

  // Auto-trigger AI layout on mount if we have sample data
  useEffect(() => {
    if (sampleData && sampleData.length > 0 && !initialDesignConfig?.fields) {
      console.log('🎨 AUTO-TRIGGERING AI LAYOUT ON MOUNT');
      handleAutoLayout();
    }
  }, []); // Empty deps = only run once on mount

  const selectedField = fields.find(f => f.id === selectedFieldId) || null;
  const sampleRow = sampleData?.[currentDataIndex];

  // Real-time overset detection for design canvas
  const fieldOversets = useMemo(() => {
    if (!sampleRow) return fields.map(() => ({ hasOverflow: false, overflowPercentage: 0 }));
    
    return fields.map(field => {
      if (field.fieldType !== 'text') return { hasOverflow: false, overflowPercentage: 0 };
      
      const text = String(sampleRow[field.templateField] || '');
      if (!text) return { hasOverflow: false, overflowPercentage: 0 };
      
      const containerWidth = mmToPx(field.size.width, 1); // Use scale=1 for accurate measurement
      const containerHeight = mmToPx(field.size.height, 1);
      
      return detectTextOverflow(
        text,
        containerWidth,
        containerHeight,
        field.style.fontSize,
        field.style.fontFamily,
        field.style.fontWeight,
        6 // Match auto-layout padding
      );
    });
  }, [fields, sampleRow]);

  // Calculate overset count for current label (used in header badge)
  const oversetCount = useMemo(() => {
    if (!sampleData || sampleData.length === 0 || !sampleRow) return 0;

    let count = 0;
    fields.forEach((field) => {
      if (field.fieldType !== 'text') return;
      
      const dataValue = sampleRow[field.templateField] || field.templateField;
      const text = String(dataValue);
      if (!text) return;

      const containerWidth = mmToPx(field.size.width, 1);
      const containerHeight = mmToPx(field.size.height, 1);

      const hasOverflow = detectTextOverflow(
        text,
        containerWidth,
        containerHeight,
        field.style.fontSize,
        field.style.fontFamily,
        field.style.fontWeight,
        6
      );

      if (hasOverflow.hasOverflow) {
        count++;
      }
    });

    return count;
  }, [fields, sampleRow, currentDataIndex]);

  // Keyboard navigation for sample data
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sampleData || sampleData.length <= 1) return;
      
      if (e.key === 'ArrowLeft' && currentDataIndex > 0) {
        setCurrentDataIndex(currentDataIndex - 1);
      } else if (e.key === 'ArrowRight' && currentDataIndex < sampleData.length - 1) {
        setCurrentDataIndex(currentDataIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDataIndex, sampleData]);

  const handleSave = () => {
    finalizeFieldPositions();
    const designConfig = {
      fields,
      canvasSettings: {
        backgroundColor: settings.backgroundColor,
        showGrid: settings.showGrid,
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize,
        showAllLabels: settings.showAllLabels,
        defaultLabelFontSize: settings.defaultLabelFontSize
      }
    };
    onSave(designConfig);
  };

  const handleCanvasClick = () => {
    setSelectedFieldId(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* AI Layout Loading Overlay */}
      {isAutoLayoutLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border rounded-lg p-6 shadow-lg flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="text-center">
              <h3 className="font-semibold text-lg">AI is Optimizing Your Layout</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Analyzing {sampleData?.length || 0} labels...
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Compact header with step indicator and navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          {stepInfo && (
            <span className="text-xs text-muted-foreground font-medium">
              Step {stepInfo.current} of {stepInfo.total}
            </span>
          )}
          <span className="text-sm font-semibold">Design Layout</span>
          
          {/* Navigation for sample data */}
          {sampleData && sampleData.length > 1 && (
            <div className="flex items-center gap-2 text-sm border-l pl-3 ml-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('⬅️ Previous label clicked, current:', currentDataIndex);
                  setCurrentDataIndex(Math.max(0, currentDataIndex - 1));
                }}
                disabled={currentDataIndex === 0}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-muted-foreground text-xs">
                Label {currentDataIndex + 1} of {sampleData.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('➡️ Next label clicked, current:', currentDataIndex);
                  setCurrentDataIndex(Math.min(sampleData.length - 1, currentDataIndex + 1));
                }}
                disabled={currentDataIndex >= sampleData.length - 1}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Overset warning badge */}
          {oversetCount > 0 && (
            <Badge variant="destructive" className="gap-1.5 ml-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              {oversetCount} overflow{oversetCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            import('sonner').then(m => m.toast.info('Drag fields to position them, resize using handles, and use toolbar to style. Use arrows to preview different labels.'));
          }}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>

      {/* Compact toolbar */}
      <div className="flex-shrink-0 border-b bg-muted/30">
        <CanvasToolbar
          zoom={settings.scale}
          onZoomIn={() => updateSettings({ scale: Math.min(5, settings.scale + 0.5) })}
          onZoomOut={() => updateSettings({ scale: Math.max(1, settings.scale - 0.5) })}
          showGrid={settings.showGrid}
          onToggleGrid={() => updateSettings({ showGrid: !settings.showGrid })}
          snapToGrid={settings.snapToGrid}
          onToggleSnap={() => updateSettings({ snapToGrid: !settings.snapToGrid })}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onAutoLayout={handleAutoLayout}
          isAutoLayoutLoading={isAutoLayoutLoading}
          showAllLabels={settings.showAllLabels}
          onToggleAllLabels={() => toggleAllFieldLabels(!settings.showAllLabels)}
          selectedField={selectedField}
          onUpdateFieldStyle={(updates) => {
            if (selectedFieldId) {
              updateFieldStyle(selectedFieldId, updates);
            }
          }}
          onToggleLabel={() => {
            if (selectedFieldId) {
              toggleFieldLabels(selectedFieldId);
            }
          }}
          onUpdateFieldType={(fieldType, typeConfig) => {
            if (selectedFieldId) {
              updateFieldType(selectedFieldId, fieldType, typeConfig);
            }
          }}
        />
      </div>

      {/* Main canvas area - takes all available space */}
      <div className="flex-1 overflow-auto bg-muted/20 p-4 min-h-0">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2">
            {/* Compact template info */}
            <div className="text-xs text-muted-foreground">
              {templateName} ({templateSize.width} × {templateSize.height}mm)
            </div>
            
            {/* The actual canvas */}
            <div
              ref={canvasRef}
              className="relative border-2 border-border shadow-xl bg-background"
                style={{
                  width: `${mmToPx(templateSize.width, settings.scale)}px`,
                  height: `${mmToPx(templateSize.height, settings.scale)}px`,
                  backgroundColor: settings.backgroundColor,
                  backgroundImage: settings.showGrid
                    ? `linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                       linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`
                    : 'none',
                  backgroundSize: settings.showGrid
                    ? `${mmToPx(settings.gridSize, settings.scale)}px ${mmToPx(settings.gridSize, settings.scale)}px`
                    : 'auto'
                }}
                onClick={handleCanvasClick}
              >
                {fields.map((field, index) => (
                  <FieldElement
                    key={field.id}
                    field={field}
                    scale={settings.scale}
                    isSelected={field.id === selectedFieldId}
                    sampleData={sampleRow}
                    showAllLabels={settings.showAllLabels}
                    hasOverflow={fieldOversets[index]?.hasOverflow}
                    overflowPercentage={fieldOversets[index]?.overflowPercentage || 0}
                    onSelect={() => setSelectedFieldId(field.id)}
                    onMove={(position) => moveField(field.id, position)}
                    onResize={(size) => resizeField(field.id, size)}
                    onMoveEnd={finalizeFieldPositions}
                    onDelete={() => {
                      deleteField(field.id);
                      import('sonner').then(m => m.toast.success(`Field "${field.templateField}" removed. Click undo to restore.`));
                    }}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Compact action buttons - fixed at bottom */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t bg-background">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Back
        </Button>
        <Button size="sm" onClick={handleSave}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Save Design
        </Button>
      </div>
    </div>
  );
}
