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
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onAutoLayout}>
        <Wand2 className="h-3.5 w-3.5 mr-1.5" />
        <span className="text-xs">Auto</span>
      </Button>

      {/* Field styling options - only show when field is selected */}
      {selectedField && (
        <>
          <Separator orientation="vertical" className="h-5" />
          
          {/* Show label toggle */}
          <Button
            variant={selectedField.showLabel ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleLabel}
            title="Toggle field label"
          >
            <Tag className="h-3.5 w-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5" />
          
          {/* Field type selector */}
          <Select
            value={selectedField.fieldType}
            onValueChange={(value: FieldType) => {
              const typeConfig = value === 'sequence' 
                ? { sequenceStart: 1, sequencePadding: 3 }
                : value === 'barcode'
                ? { barcodeFormat: 'CODE128' as const }
                : value === 'qrcode'
                ? { qrErrorCorrection: 'M' as const }
                : undefined;
              onUpdateFieldType(value, typeConfig);
            }}
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">
                <div className="flex items-center gap-2">
                  <Type className="h-3 w-3" />
                  <span>Text</span>
                </div>
              </SelectItem>
              <SelectItem value="barcode">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3 w-3" />
                  <span>Barcode</span>
                </div>
              </SelectItem>
              <SelectItem value="qrcode">
                <div className="flex items-center gap-2">
                  <QrCode className="h-3 w-3" />
                  <span>QR Code</span>
                </div>
              </SelectItem>
              <SelectItem value="sequence">
                <div className="flex items-center gap-2">
                  <Hash className="h-3 w-3" />
                  <span>Sequence</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Separator orientation="vertical" className="h-5" />
          
          {/* Font size - only for text fields */}
          {selectedField.fieldType === 'text' && (
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
                  {[6, 8, 10, 12, 14, 16, 18, 20, 24].map(size => (
                    <SelectItem key={size} value={size.toString()}>{size}pt</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          
          {/* Bold - only for text fields */}
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
