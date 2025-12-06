// ============================================================================
// BACKGROUND SETTINGS PANEL - Page background color and image
// ============================================================================

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { Paintbrush, Image, X, Upload } from 'lucide-react';
import type { DesignPage } from '@/lib/editor/types';

interface BackgroundSettingsPanelProps {
  page: DesignPage;
  onPageUpdate: (updates: Partial<DesignPage>) => void;
  readOnly?: boolean;
}

// Preset background colors
const PRESET_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Light Gray', value: '#f5f5f5' },
  { name: 'Cream', value: '#fffef0' },
  { name: 'Light Blue', value: '#f0f8ff' },
  { name: 'Light Green', value: '#f0fff0' },
  { name: 'Light Pink', value: '#fff0f5' },
  { name: 'Light Yellow', value: '#fffacd' },
  { name: 'Transparent', value: 'transparent' },
];

export function BackgroundSettingsPanel({
  page,
  onPageUpdate,
  readOnly = false
}: BackgroundSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleColorChange = useCallback((color: string) => {
    onPageUpdate({ backgroundColor: color });
  }, [onPageUpdate]);
  
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) return;
    
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    onPageUpdate({ backgroundImage: dataUrl });
  }, [onPageUpdate]);
  
  const handleRemoveImage = useCallback(() => {
    onPageUpdate({ backgroundImage: undefined });
  }, [onPageUpdate]);
  
  const currentColor = page.backgroundColor || '#ffffff';
  const hasBackgroundImage = !!page.backgroundImage;
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8"
          disabled={readOnly}
        >
          <Paintbrush className="h-4 w-4" />
          Background
          {hasBackgroundImage && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Background Color</h4>
            
            {/* Color picker */}
            <div className="flex gap-2 mb-3">
              <input
                type="color"
                value={currentColor === 'transparent' ? '#ffffff' : currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer"
                disabled={readOnly}
              />
              <Input
                type="text"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="h-9 text-xs font-mono flex-1"
                placeholder="#ffffff"
                disabled={readOnly}
              />
            </div>
            
            {/* Preset colors */}
            <div className="grid grid-cols-4 gap-1.5">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleColorChange(preset.value)}
                  className={`
                    h-8 rounded border-2 transition-all
                    ${currentColor === preset.value 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-border hover:border-primary/50'
                    }
                    ${preset.value === 'transparent' 
                      ? 'bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#ffffff_0%_50%)_50%/16px_16px]' 
                      : ''
                    }
                  `}
                  style={{ 
                    backgroundColor: preset.value !== 'transparent' ? preset.value : undefined 
                  }}
                  title={preset.name}
                  disabled={readOnly}
                />
              ))}
            </div>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium text-sm mb-2">Background Image</h4>
            
            {hasBackgroundImage ? (
              <div className="space-y-2">
                {/* Preview */}
                <div className="relative w-full h-20 bg-muted rounded-lg overflow-hidden">
                  <img
                    src={page.backgroundImage}
                    alt="Background"
                    className="w-full h-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={handleRemoveImage}
                    disabled={readOnly}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Background image will be placed behind all elements
                </p>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="background-upload"
                  disabled={readOnly}
                />
                <label
                  htmlFor="background-upload"
                  className="cursor-pointer flex flex-col items-center gap-1"
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Upload background image
                  </span>
                </label>
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-muted-foreground">
            Note: Background color shows through transparent areas of the background image.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}