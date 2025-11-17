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
}

export function TemplateDesignCanvas({
  templateSize,
  templateName,
  fieldNames,
  sampleData,
  onSave,
  onCancel
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
    <div className="flex flex-col h-full">
      {/* Info Alert */}
      <Alert className="mb-4">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Drag fields to position them, resize using the corner handle, and use the toolbar to style your template. 
          Click "Auto Layout" for automatic field positioning.
        </AlertDescription>
      </Alert>

      {/* Toolbar */}
      <CanvasToolbar
        selectedField={selectedField}
        scale={settings.scale}
        showGrid={settings.showGrid}
        snapToGrid={settings.snapToGrid}
        onScaleChange={(scale) => updateSettings({ scale })}
        onToggleGrid={() => updateSettings({ showGrid: !settings.showGrid })}
        onToggleSnap={() => updateSettings({ snapToGrid: !settings.snapToGrid })}
        onUndo={undo}
        onRedo={redo}
        onAutoLayout={autoLayout}
        onStyleChange={(style) => {
          if (selectedFieldId) {
            updateFieldStyle(selectedFieldId, style);
          }
        }}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-muted/20 p-8">
        <div className="flex justify-center">
          <Card className="shadow-xl">
            <div className="p-4">
              <div className="text-sm text-muted-foreground mb-2 text-center">
                {templateName} ({templateSize.width}mm × {templateSize.height}mm)
              </div>
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
                    onMoveEnd={() => {}}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between p-4 border-t bg-background">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button onClick={handleSave}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Save Design
        </Button>
      </div>
    </div>
  );
}
