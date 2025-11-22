import { useRef, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FieldElement } from './canvas/FieldElement';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { useCanvasState } from '@/hooks/useCanvasState';
import { mmToPx } from '@/lib/canvas-utils';
import { CheckCircle2, Info, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InlinePreviewArea } from './InlinePreviewArea';
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
  
  const [previewMode, setPreviewMode] = useState(false);
  const [currentLabelIndex, setCurrentLabelIndex] = useState(0);
  
  // CRITICAL: Snapshot ref to capture exact field state for preview
  const fieldsSnapshotRef = useRef<any[]>([]);

  const {
    fields,
    selectedFieldId,
    settings,
    setSelectedFieldId,
    moveField,
    resizeField,
    updateFieldStyle,
    updateSettings,
    autoLayout,
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

  const selectedField = fields.find(f => f.id === selectedFieldId) || null;
  const sampleRow = sampleData?.[0];

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
        field.style.fontWeight
      );
    });
  }, [fields, sampleRow]);

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

  const handlePreviewClick = () => {
    if (!sampleData || sampleData.length === 0) {
      toast({ 
        title: "No data available", 
        description: "Please upload data first to preview",
        variant: "destructive" 
      });
      return;
    }
    
    console.log('📸 Preview button clicked - Capturing field snapshot');
    
    // Finalize positions first
    finalizeFieldPositions();
    
    // CRITICAL: Synchronously capture deep clone of current fields state
    // This ensures preview gets exact field positions, not stale state
    fieldsSnapshotRef.current = JSON.parse(JSON.stringify(fields));
    
    console.log('📸 SNAPSHOT CAPTURED:', {
      fieldCount: fieldsSnapshotRef.current.length,
      fields: fieldsSnapshotRef.current.map(f => ({
        name: f.templateField,
        position: f.position,
        size: f.size,
        fontSize: f.style.fontSize
      }))
    });
    
    // Enter preview mode immediately (no setTimeout needed)
    setPreviewMode(true);
    setCurrentLabelIndex(0);
  };

  // Create mappings from current field positions (1:1 mapping during design)
  const currentMappings: Record<string, string> = {};
  fields.forEach(field => {
    currentMappings[field.templateField] = field.templateField;
  });

  // Template object for preview
  const templateObj = {
    id: templateId,
    name: templateName,
    width_mm: templateSize.width,
    height_mm: templateSize.height,
    template_type: 'built_in_library'
  };

  // Calculate overset count for current label
  const oversetCount = useMemo(() => {
    if (!previewMode || !sampleData || currentLabelIndex >= sampleData.length) return 0;
    
    const currentRow = sampleData[currentLabelIndex];
    let count = 0;

    fields.forEach(field => {
      if (field.fieldType !== 'text') return;
      
      const dataColumn = currentMappings[field.templateField];
      if (!dataColumn) return;
      
      const text = String(currentRow[dataColumn] || '');
      if (!text) return;

      const containerWidth = mmToPx(field.size.width, 1);
      const containerHeight = mmToPx(field.size.height, 1);
      
      const overflow = detectTextOverflow(
        text,
        containerWidth,
        containerHeight,
        field.style.fontSize,
        field.style.fontFamily,
        field.style.fontWeight
      );

      if (overflow.hasOverflow) count++;
    });

    return count;
  }, [previewMode, currentLabelIndex, sampleData, fields, currentMappings]);

  if (previewMode) {
    // Show inline preview mode using SNAPSHOT (not live state)
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <InlinePreviewArea
          currentIndex={currentLabelIndex}
          totalLabels={sampleData?.length || 0}
          template={templateObj}
          designConfig={{ 
            fields: fieldsSnapshotRef.current, // Use snapshot instead of live state
            canvasSettings: { ...settings, scale: 1 } // Force scale=1 for 1:1 preview
          }}
          allDataRows={sampleData || []}
          fieldMappings={currentMappings}
          onNext={() => setCurrentLabelIndex(i => Math.min(i + 1, (sampleData?.length || 1) - 1))}
          onPrev={() => setCurrentLabelIndex(i => Math.max(i - 1, 0))}
          onClose={() => setPreviewMode(false)}
          oversetCount={oversetCount}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact header with step indicator and help */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          {stepInfo && (
            <span className="text-xs text-muted-foreground font-medium">
              Step {stepInfo.current} of {stepInfo.total}
            </span>
          )}
          <span className="text-sm font-semibold">Design Layout</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            import('sonner').then(m => m.toast.info('Drag fields to position them, resize using handles, and use toolbar to style.'));
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
          onAutoLayout={autoLayout}
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewClick}
            disabled={!sampleData || sampleData.length === 0}
          >
            Preview Pages
          </Button>
          <Button size="sm" onClick={handleSave}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Save Design
          </Button>
        </div>
      </div>
    </div>
  );
}
