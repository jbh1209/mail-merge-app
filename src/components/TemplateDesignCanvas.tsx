import { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FieldElement } from './canvas/FieldElement';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { useCanvasState } from '@/hooks/useCanvasState';
import { mmToPx } from '@/lib/canvas-utils';
import { CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TemplateDesignCanvasProps {
  templateSize: { width: number; height: number };
  templateName: string;
  fieldNames: string[];
  sampleData?: Record<string, any>[];
  onSave: (designConfig: any) => void;
  onCancel: () => void;
  stepInfo?: { current: number; total: number };
}

export function TemplateDesignCanvas({
  templateSize,
  templateName,
  fieldNames,
  sampleData,
  onSave,
  onCancel,
  stepInfo
}: TemplateDesignCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

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
    updateFieldType,
    undo,
    redo,
    canUndo,
    canRedo,
    finalizeFieldPositions
  } = useCanvasState({
    templateSize,
    initialFields: fieldNames
  });

  const selectedField = fields.find(f => f.id === selectedFieldId) || null;
  const sampleRow = sampleData?.[0];

  const handleSave = () => {
    finalizeFieldPositions();
    const designConfig = {
      fields,
      canvasSettings: {
        backgroundColor: settings.backgroundColor,
        showGrid: settings.showGrid,
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize
      }
    };
    onSave(designConfig);
  };

  const handleCanvasClick = () => {
    setSelectedFieldId(null);
  };

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
      <div className="flex-1 overflow-auto bg-muted/20 p-2 min-h-0">
        <div className="flex items-center justify-center h-full">
          <Card className="shadow-xl">
            <div className="p-2">
              {/* Compact template info */}
              <div className="text-xs text-muted-foreground mb-1 text-center">
                {templateName} ({templateSize.width} × {templateSize.height}mm)
              </div>
              
              {/* The actual canvas */}
              <div
                ref={canvasRef}
                className="relative border-2 border-border shadow-inner"
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
                {fields.map((field) => (
                  <FieldElement
                    key={field.id}
                    field={field}
                    scale={settings.scale}
                    isSelected={field.id === selectedFieldId}
                    sampleData={sampleRow}
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
          </Card>
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
