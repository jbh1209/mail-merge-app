// ============================================================================
// FLOATING TOOLBAR - Context-sensitive toolbar that appears above selected element
// ============================================================================

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { DesignElement, ShapeConfig, ElementStyle } from '@/lib/editor/types';
import { POPULAR_GOOGLE_FONTS } from '@/lib/google-fonts';

interface FloatingToolbarProps {
  element: DesignElement | null;
  position: { x: number; y: number };
  zoom: number;
  onUpdateElement: (updates: Partial<DesignElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

export function FloatingToolbar({
  element,
  position,
  zoom,
  onUpdateElement,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
}: FloatingToolbarProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  if (!element) return null;

  const isTextBased = ['text', 'address_block', 'sequence'].includes(element.kind);
  const isShape = element.kind === 'shape';
  const isBarcode = element.kind === 'barcode' || element.kind === 'qr';

  const handleFontChange = (fontFamily: string) => {
    if (element.kind === 'text' || element.kind === 'address_block' || element.kind === 'sequence') {
      onUpdateElement({
        style: { ...element.style, fontFamily }
      });
    }
  };

  const handleFontSizeChange = (size: string) => {
    const fontSize = parseInt(size, 10);
    if (!isNaN(fontSize) && fontSize > 0) {
      onUpdateElement({
        style: { ...element.style, fontSize }
      });
    }
  };

  const toggleBold = () => {
    const currentWeight = element.style?.fontWeight || 'normal';
    const newWeight = currentWeight === 'bold' ? 'normal' : 'bold';
    onUpdateElement({
      style: { ...element.style, fontWeight: newWeight }
    });
  };

  const handleAlignment = (align: 'left' | 'center' | 'right') => {
    onUpdateElement({
      style: { ...element.style, textAlign: align }
    });
  };

  const handleColorChange = (color: string) => {
    if (isShape) {
      // For shapes, update the fill in config
      const shapeConfig = element.config as ShapeConfig | undefined;
      onUpdateElement({
        style: { ...element.style, fill: color }
      });
    } else {
      onUpdateElement({
        style: { ...element.style, color }
      });
    }
  };

  // Get current color based on element type
  const getCurrentColor = (): string => {
    if (isShape) {
      return element.style?.fill || '#e5e5e5';
    }
    return element.style?.color || '#000000';
  };

  // Calculate toolbar position - above the element, centered
  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: Math.max(position.y - 52, 8), // 52px above element, min 8px from top
    transform: 'translateX(-50%)',
    zIndex: 100,
  };

  return (
    <div
      style={toolbarStyle}
      className="flex items-center gap-1 px-2 py-1.5 bg-popover border rounded-lg shadow-lg"
    >
      {/* Text-specific tools */}
      {isTextBased && (
        <>
          {/* Font Family */}
          <Select
            value={element.style?.fontFamily || 'Arial'}
            onValueChange={handleFontChange}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPULAR_GOOGLE_FONTS.map(font => (
                <SelectItem key={font.name} value={font.name} className="text-xs">
                  {font.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Font Size */}
          <Input
            type="number"
            value={element.style?.fontSize || 12}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="h-7 w-14 text-xs text-center"
            min={6}
            max={200}
          />

          <Separator orientation="vertical" className="h-5" />

          {/* Bold */}
          <Button
            variant={element.style?.fontWeight === 'bold' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={toggleBold}
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>

          {/* Alignment */}
          <div className="flex">
            <Button
              variant={element.style?.textAlign === 'left' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => handleAlignment('left')}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={element.style?.textAlign === 'center' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => handleAlignment('center')}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={element.style?.textAlign === 'right' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => handleAlignment('right')}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-5" />
        </>
      )}

      {/* Color Picker (for text & shapes) */}
      {(isTextBased || isShape) && (
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <div
                className="h-4 w-4 rounded border"
                style={{ backgroundColor: getCurrentColor() }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="center">
            <div className="grid grid-cols-8 gap-1">
              {[
                '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#ffffff',
                '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
                '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777',
              ].map(color => (
                <button
                  key={color}
                  className="h-6 w-6 rounded border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    handleColorChange(color);
                    setColorPickerOpen(false);
                  }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Separator orientation="vertical" className="h-5" />

      {/* Layer Controls */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBringForward} title="Bring Forward">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSendBackward} title="Send Backward">
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="h-5" />

      {/* Duplicate */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
        <Copy className="h-3.5 w-3.5" />
      </Button>

      {/* Delete */}
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
