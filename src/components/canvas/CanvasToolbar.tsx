import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { FieldConfig } from '@/lib/canvas-utils';
import { 
  ZoomIn, 
  ZoomOut, 
  Grid3x3, 
  Undo2, 
  Redo2, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Type,
  Wand2
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

interface CanvasToolbarProps {
  selectedField: FieldConfig | null;
  scale: number;
  showGrid: boolean;
  snapToGrid: boolean;
  onScaleChange: (scale: number) => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onStyleChange: (style: Partial<FieldConfig['style']>) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function CanvasToolbar({
  selectedField,
  scale,
  showGrid,
  snapToGrid,
  onScaleChange,
  onToggleGrid,
  onToggleSnap,
  onUndo,
  onRedo,
  onAutoLayout,
  onStyleChange,
  canUndo,
  canRedo
}: CanvasToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onScaleChange(Math.max(1, scale - 0.5))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium w-10 text-center">{Math.round(scale * 100)}%</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onScaleChange(Math.min(5, scale + 0.5))}
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

      {/* Auto Layout */}
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onAutoLayout}>
        <Wand2 className="h-3.5 w-3.5 mr-1.5" />
        <span className="text-xs">Auto</span>
      </Button>

      {/* Field Styling - Only show when field is selected */}
      {selectedField && (
        <>
          <Separator orientation="vertical" className="h-5" />
          
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Font:</Label>
            <Select
              value={selectedField.style.fontSize.toString()}
              onValueChange={(value) => onStyleChange({ fontSize: parseInt(value) })}
            >
              <SelectTrigger className="w-16 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[6, 8, 10, 12, 14, 16, 18, 20, 24].map(size => (
                  <SelectItem key={size} value={size.toString()}>{size}pt</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'left' ? 'default' : 'ghost'}
              className="h-7 w-7 p-0"
              onClick={() => onStyleChange({ textAlign: 'left' })}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'center' ? 'default' : 'ghost'}
              className="h-7 w-7 p-0"
              onClick={() => onStyleChange({ textAlign: 'center' })}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'right' ? 'default' : 'ghost'}
              className="h-7 w-7 p-0"
              onClick={() => onStyleChange({ textAlign: 'right' })}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            size="sm"
            variant={selectedField.style.fontWeight === 'bold' ? 'default' : 'ghost'}
            className="h-7 w-7 p-0"
            onClick={() => onStyleChange({ 
              fontWeight: selectedField.style.fontWeight === 'bold' ? 'normal' : 'bold' 
            })}
          >
            <Type className="h-3.5 w-3.5 font-bold" />
          </Button>
        </>
      )}
    </div>
  );
}
