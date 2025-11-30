import { ZoomIn, ZoomOut, Grid3x3, Undo2, Redo2, Wand2, Type, AlignLeft, AlignCenter, AlignRight, Bold, Plus, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldConfig, FieldType, isTextBasedFieldType } from '@/lib/canvas-utils';
import { POPULAR_GOOGLE_FONTS } from '@/lib/google-fonts';
import { AlignmentToolbar } from './AlignmentToolbar';

interface CanvasToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  isAutoLayoutLoading?: boolean;
  showAllLabels: boolean;
  onToggleAllLabels: () => void;
  selectedField: FieldConfig | null;
  selectedCount: number;
  onUpdateFieldStyle: (updates: Partial<FieldConfig['style']>) => void;
  onToggleLabel: () => void;
  onUpdateFieldType: (fieldType: FieldType, typeConfig?: any) => void;
  onAddElement: () => void;
  showLayers: boolean;
  onToggleLayers: () => void;
  onAlign: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute: (direction: 'horizontal' | 'vertical') => void;
}

export function CanvasToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  showGrid,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  isAutoLayoutLoading = false,
  showAllLabels,
  onToggleAllLabels,
  selectedField,
  selectedCount,
  onUpdateFieldStyle,
  onToggleLabel,
  onUpdateFieldType,
  onAddElement,
  showLayers,
  onToggleLayers,
  onAlign,
  onDistribute
}: CanvasToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 overflow-x-auto">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onZoomOut}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onZoomIn}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Grid Controls */}
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={showGrid ? "default" : "ghost"}
          className="h-7 w-7 p-0"
          onClick={onToggleGrid}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Switch checked={snapToGrid} onCheckedChange={onToggleSnap} className="scale-75" />
          <Label className="text-xs">Snap</Label>
        </div>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* History Controls */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Add Element */}
      <Button 
        size="sm" 
        variant="ghost" 
        className="h-7 px-2" 
        onClick={onAddElement}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        <span className="text-xs">Add Element</span>
      </Button>

      <Separator orientation="vertical" className="h-5" />

      {/* Layers Toggle */}
      <Button 
        size="sm" 
        variant={showLayers ? "default" : "ghost"}
        className="h-7 w-7 p-0" 
        onClick={onToggleLayers}
      >
        <Layers className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="h-5" />

      {/* Auto Layout */}
      <Button
        size="sm" 
        variant="ghost" 
        className="h-7 px-2" 
        onClick={onAutoLayout}
        disabled={isAutoLayoutLoading}
      >
        {isAutoLayoutLoading ? (
          <div className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
        )}
        <span className="text-xs">AI Layout</span>
      </Button>

      <Separator orientation="vertical" className="h-5" />

      {/* Global Label Toggle */}
      <div className="flex items-center gap-1.5">
        <Switch checked={showAllLabels} onCheckedChange={onToggleAllLabels} className="scale-75" />
        <Label className="text-xs">Show All Labels</Label>
      </div>

      {/* Alignment tools - show when fields are selected */}
      <AlignmentToolbar
        selectedCount={selectedCount}
        onAlign={onAlign}
        onDistribute={onDistribute}
      />

      {/* Field styling options - only show when single field is selected */}
      {selectedField && selectedCount === 1 && (
        <>
          <Separator orientation="vertical" className="h-5" />
          
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            Text Format
          </span>
          
          {/* Field label toggle */}
          <div className="flex items-center gap-1.5">
            <Switch 
              checked={selectedField.showLabel || false} 
              onCheckedChange={onToggleLabel} 
              className="scale-75" 
            />
            <Label className="text-xs">Field Label</Label>
          </div>

          <Separator orientation="vertical" className="h-5" />
          
          {/* Font family - only for text-based fields */}
          {isTextBasedFieldType(selectedField.fieldType) && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <Select
                value={selectedField.style.fontFamily || 'Arial, sans-serif'}
                onValueChange={(value) => onUpdateFieldStyle({ fontFamily: value })}
              >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {POPULAR_GOOGLE_FONTS.map(font => (
                    <SelectItem key={font.family} value={font.family}>
                      <span style={{ fontFamily: font.family }}>{font.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Font size - only for text-based fields */}
          {isTextBasedFieldType(selectedField.fieldType) && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex items-center gap-1">
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={Math.round(selectedField.style.fontSize).toString()}
                  onValueChange={(value) => onUpdateFieldStyle({ fontSize: parseInt(value) })}
                >
                  <SelectTrigger className="w-16 h-7 text-xs">
                    <SelectValue placeholder={`${Math.round(selectedField.style.fontSize)}pt`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const standardSizes = [6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36];
                      const currentSize = Math.round(selectedField.style.fontSize);
                      const allSizes = standardSizes.includes(currentSize) 
                        ? standardSizes 
                        : [...standardSizes, currentSize].sort((a, b) => a - b);
                      return allSizes.map(size => (
                        <SelectItem key={size} value={size.toString()}>{size}pt</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          
          {/* Text align - only for text-based fields */}
          {isTextBasedFieldType(selectedField.fieldType) && (
            <div className="flex items-center gap-0.5">
              <Button
                variant={selectedField.style.textAlign === 'left' ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onUpdateFieldStyle({ textAlign: 'left' })}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={selectedField.style.textAlign === 'center' ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onUpdateFieldStyle({ textAlign: 'center' })}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={selectedField.style.textAlign === 'right' ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onUpdateFieldStyle({ textAlign: 'right' })}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          
          {/* Bold toggle - only for text-based fields */}
          {isTextBasedFieldType(selectedField.fieldType) && (
            <Button
              variant={selectedField.style.fontWeight === 'bold' ? "default" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onUpdateFieldStyle({ 
                fontWeight: selectedField.style.fontWeight === 'bold' ? 'normal' : 'bold' 
              })}
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
