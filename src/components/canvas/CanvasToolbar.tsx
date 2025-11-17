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
    <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/30 border-b">
      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onScaleChange(Math.max(1, scale - 0.5))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onScaleChange(Math.min(5, scale + 0.5))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Grid Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={showGrid ? "default" : "outline"}
          onClick={onToggleGrid}
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Switch checked={snapToGrid} onCheckedChange={onToggleSnap} />
          <Label className="text-sm">Snap</Label>
        </div>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* History Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Auto Layout */}
      <Button size="sm" variant="outline" onClick={onAutoLayout}>
        <Wand2 className="h-4 w-4 mr-2" />
        Auto Layout
      </Button>

      {/* Field Styling - Only show when field is selected */}
      {selectedField && (
        <>
          <Separator orientation="vertical" className="h-6" />
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Font:</Label>
            <Select
              value={selectedField.style.fontSize.toString()}
              onValueChange={(value) => onStyleChange({ fontSize: parseInt(value) })}
            >
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[6, 8, 10, 12, 14, 16, 18, 20, 24].map(size => (
                  <SelectItem key={size} value={size.toString()}>{size}pt</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'left' ? 'default' : 'outline'}
              onClick={() => onStyleChange({ textAlign: 'left' })}
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'center' ? 'default' : 'outline'}
              onClick={() => onStyleChange({ textAlign: 'center' })}
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={selectedField.style.textAlign === 'right' ? 'default' : 'outline'}
              onClick={() => onStyleChange({ textAlign: 'right' })}
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            size="sm"
            variant={selectedField.style.fontWeight === 'bold' ? 'default' : 'outline'}
            onClick={() => onStyleChange({ 
              fontWeight: selectedField.style.fontWeight === 'bold' ? 'normal' : 'bold' 
            })}
          >
            <Type className="h-4 w-4 font-bold" />
          </Button>
        </>
      )}
    </div>
  );
}
