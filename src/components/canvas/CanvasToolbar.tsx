import { ZoomIn, ZoomOut, Grid3x3, Undo2, Redo2, Wand2, Type, AlignLeft, AlignCenter, AlignRight, Bold, Tag, BarChart3, QrCode, Hash } from 'lucide-react';
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
import { FieldConfig, FieldType } from '@/lib/canvas-utils';
import { POPULAR_GOOGLE_FONTS } from '@/lib/google-fonts';

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
  onUpdateFieldStyle: (updates: Partial<FieldConfig['style']>) => void;
  onToggleLabel: () => void;
  onUpdateFieldType: (fieldType: FieldType, typeConfig?: any) => void;
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
  onUpdateFieldStyle,
  onToggleLabel,
  onUpdateFieldType
}: CanvasToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
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

      {/* Field styling options - only show when field is selected */}
      {selectedField && (
        <>
          <Separator orientation="vertical" className="h-5" />
          
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
          
          {/* Field type selector */}
          <Select value={selectedField.fieldType} onValueChange={(value: FieldType) => onUpdateFieldType(value)}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">
                <div className="flex items-center gap-2">
                  <Type className="h-3.5 w-3.5" />
                  <div className="flex flex-col items-start">
                    <span>Text</span>
                    <span className="text-[10px] text-muted-foreground">Standard data</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="barcode">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <div className="flex flex-col items-start">
                    <span>Barcode</span>
                    <span className="text-[10px] text-muted-foreground">Linear codes</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="qrcode">
                <div className="flex items-center gap-2">
                  <QrCode className="h-3.5 w-3.5" />
                  <div className="flex flex-col items-start">
                    <span>QR Code</span>
                    <span className="text-[10px] text-muted-foreground">2D matrix</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="sequence">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5" />
                  <div className="flex flex-col items-start">
                    <span>Sequence</span>
                    <span className="text-[10px] text-muted-foreground">Auto-increment</span>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Font family - only for text fields */}
          {selectedField.fieldType === 'text' && (
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

          {/* Font size - only for text fields */}
          {selectedField.fieldType === 'text' && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex items-center gap-1">
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={selectedField.style.fontSize.toString()}
                  onValueChange={(value) => onUpdateFieldStyle({ fontSize: parseInt(value) })}
                >
                  <SelectTrigger className="w-16 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36].map(size => (
                      <SelectItem key={size} value={size.toString()}>{size}pt</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          
          {/* Text align - only for text fields */}
          {selectedField.fieldType === 'text' && (
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
          
          {/* Bold toggle - only for text fields */}
          {selectedField.fieldType === 'text' && (
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
