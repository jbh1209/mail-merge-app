import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LayoutGrid, RotateCw, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface PageSizeControlsProps {
  widthMm: number;
  heightMm: number;
  onChange: (width: number, height: number) => void;
}

// Common paper sizes in mm
const PAPER_PRESETS = [
  { id: 'a4-portrait', label: 'A4 Portrait', width: 210, height: 297 },
  { id: 'a4-landscape', label: 'A4 Landscape', width: 297, height: 210 },
  { id: 'a5-portrait', label: 'A5 Portrait', width: 148, height: 210 },
  { id: 'a5-landscape', label: 'A5 Landscape', width: 210, height: 148 },
  { id: 'letter-portrait', label: 'Letter Portrait', width: 216, height: 279 },
  { id: 'letter-landscape', label: 'Letter Landscape', width: 279, height: 216 },
  { id: 'legal-portrait', label: 'Legal Portrait', width: 216, height: 356 },
  { id: 'legal-landscape', label: 'Legal Landscape', width: 356, height: 216 },
  { id: 'custom', label: 'Custom Size', width: 0, height: 0 },
];

// Tolerance for matching presets (in mm)
const TOLERANCE = 1;

function findMatchingPreset(width: number, height: number): string {
  const match = PAPER_PRESETS.find(
    (p) =>
      Math.abs(p.width - width) < TOLERANCE &&
      Math.abs(p.height - height) < TOLERANCE
  );
  return match?.id || 'custom';
}

function isLandscape(width: number, height: number): boolean {
  return width > height;
}

export function PageSizeControls({
  widthMm,
  heightMm,
  onChange,
}: PageSizeControlsProps) {
  const [open, setOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState(widthMm.toString());
  const [customHeight, setCustomHeight] = useState(heightMm.toString());

  const currentPreset = findMatchingPreset(widthMm, heightMm);
  const landscape = isLandscape(widthMm, heightMm);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = PAPER_PRESETS.find((p) => p.id === presetId);
      if (preset && preset.id !== 'custom') {
        onChange(preset.width, preset.height);
        setCustomWidth(preset.width.toString());
        setCustomHeight(preset.height.toString());
      }
    },
    [onChange]
  );

  const handleRotate = useCallback(() => {
    // Swap width and height
    onChange(heightMm, widthMm);
    setCustomWidth(heightMm.toString());
    setCustomHeight(widthMm.toString());
  }, [widthMm, heightMm, onChange]);

  const handleCustomApply = useCallback(() => {
    const w = parseFloat(customWidth);
    const h = parseFloat(customHeight);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      onChange(w, h);
    }
  }, [customWidth, customHeight, onChange]);

  // Format display size
  const displaySize = `${widthMm} × ${heightMm} mm`;
  const orientationLabel = landscape ? 'Landscape' : 'Portrait';

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">{displaySize}</span>
            <span className="sm:hidden">{orientationLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Page Size</Label>
              <Select
                value={currentPreset}
                onValueChange={handlePresetChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size..." />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                      {preset.id !== 'custom' && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {preset.width}×{preset.height}mm
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleRotate}
              >
                <RotateCw className="h-4 w-4" />
                Rotate to {landscape ? 'Portrait' : 'Landscape'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">Custom Dimensions (mm)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Width</Label>
                  <Input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    min={10}
                    max={1000}
                    step={1}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Height</Label>
                  <Input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    min={10}
                    max={1000}
                    step={1}
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full gap-2"
                onClick={handleCustomApply}
              >
                <Check className="h-4 w-4" />
                Apply Custom Size
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
