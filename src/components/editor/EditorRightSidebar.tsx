// ============================================================================
// EDITOR RIGHT SIDEBAR - Inspector Panel
// ============================================================================

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Layers
} from 'lucide-react';
import type { DesignElement, TextAlign, VerticalAlign, FontWeight } from '@/lib/editor/types';
import { POPULAR_GOOGLE_FONTS } from '@/lib/google-fonts';
import { cn } from '@/lib/utils';

interface EditorRightSidebarProps {
  selectedElements: DesignElement[];
  onElementUpdate: (elementId: string, updates: Partial<DesignElement>) => void;
  availableFields: string[];
  readOnly?: boolean;
}

export function EditorRightSidebar({
  selectedElements,
  onElementUpdate,
  availableFields,
  readOnly = false
}: EditorRightSidebarProps) {
  const element = selectedElements.length === 1 ? selectedElements[0] : null;
  const multipleSelected = selectedElements.length > 1;
  
  if (!element && !multipleSelected) {
    return (
      <div className="w-64 border-l bg-card p-4">
        <div className="text-center py-12">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Select an element to edit
          </p>
        </div>
      </div>
    );
  }
  
  if (multipleSelected) {
    return (
      <div className="w-64 border-l bg-card p-4">
        <div className="text-center py-12">
          <p className="text-sm font-medium">
            {selectedElements.length} elements selected
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Select a single element to edit properties
          </p>
        </div>
      </div>
    );
  }
  
  const updateStyle = (updates: Partial<DesignElement['style']>) => {
    if (!element) return;
    onElementUpdate(element.id, {
      style: { ...element.style, ...updates }
    });
  };
  
  const isTextBased = ['text', 'address_block', 'sequence'].includes(element!.kind);
  
  return (
    <div className="w-64 border-l bg-card flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">Inspector</h3>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
          {element!.kind.replace('_', ' ')}
        </p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Name / Data Binding */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Data Field</Label>
            <Select
              value={element!.dataField || ''}
              onValueChange={(value) => onElementUpdate(element!.id, { 
                dataField: value || undefined,
                name: value || element!.name
              })}
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None (static)</SelectItem>
                {availableFields.map(field => (
                  <SelectItem key={field} value={field}>{field}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Separator />
          
          {/* Position & Size */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Position (mm)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">X</Label>
                <Input
                  type="number"
                  value={element!.x.toFixed(1)}
                  onChange={(e) => onElementUpdate(element!.id, { x: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                  step={0.5}
                  disabled={readOnly || element!.locked}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Y</Label>
                <Input
                  type="number"
                  value={element!.y.toFixed(1)}
                  onChange={(e) => onElementUpdate(element!.id, { y: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                  step={0.5}
                  disabled={readOnly || element!.locked}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs font-medium">Size (mm)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Width</Label>
                <Input
                  type="number"
                  value={element!.width.toFixed(1)}
                  onChange={(e) => onElementUpdate(element!.id, { width: parseFloat(e.target.value) || 1 })}
                  className="h-7 text-xs"
                  step={0.5}
                  min={1}
                  disabled={readOnly || element!.locked}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Height</Label>
                <Input
                  type="number"
                  value={element!.height.toFixed(1)}
                  onChange={(e) => onElementUpdate(element!.id, { height: parseFloat(e.target.value) || 1 })}
                  className="h-7 text-xs"
                  step={0.5}
                  min={1}
                  disabled={readOnly || element!.locked}
                />
              </div>
            </div>
          </div>
          
          {/* Text Styling (for text-based elements) */}
          {isTextBased && (
            <>
              <Separator />
              
              <div className="space-y-2">
                <Label className="text-xs font-medium">Typography</Label>
                
                {/* Font Family */}
                <Select
                  value={element!.style.fontFamily || 'Roboto'}
                  onValueChange={(value) => updateStyle({ fontFamily: value })}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {POPULAR_GOOGLE_FONTS.map(font => (
                      <SelectItem 
                        key={font.name} 
                        value={font.name}
                        style={{ fontFamily: font.family }}
                      >
                        {font.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Font Size & Weight */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Size (pt)</Label>
                    <Input
                      type="number"
                      value={element!.style.fontSize || 12}
                      onChange={(e) => updateStyle({ fontSize: parseFloat(e.target.value) || 12 })}
                      className="h-7 text-xs"
                      step={0.5}
                      min={4}
                      max={144}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Weight</Label>
                    <Select
                      value={element!.style.fontWeight || 'normal'}
                      onValueChange={(value) => updateStyle({ fontWeight: value as FontWeight })}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Color */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={element!.style.color || '#000000'}
                      onChange={(e) => updateStyle({ color: e.target.value })}
                      className="h-7 w-10 rounded border cursor-pointer"
                      disabled={readOnly}
                    />
                    <Input
                      type="text"
                      value={element!.style.color || '#000000'}
                      onChange={(e) => updateStyle({ color: e.target.value })}
                      className="h-7 text-xs flex-1 font-mono"
                      disabled={readOnly}
                    />
                  </div>
                </div>
                
                {/* Alignment */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Alignment</Label>
                  <div className="flex gap-1 mt-1">
                    {[
                      { value: 'left', icon: AlignLeft },
                      { value: 'center', icon: AlignCenter },
                      { value: 'right', icon: AlignRight }
                    ].map(({ value, icon: Icon }) => (
                      <Button
                        key={value}
                        variant={element!.style.textAlign === value ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateStyle({ textAlign: value as TextAlign })}
                        disabled={readOnly}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </Button>
                    ))}
                    <div className="w-px bg-border mx-1" />
                    {[
                      { value: 'top', icon: AlignVerticalJustifyStart },
                      { value: 'middle', icon: AlignVerticalJustifyCenter },
                      { value: 'bottom', icon: AlignVerticalJustifyEnd }
                    ].map(({ value, icon: Icon }) => (
                      <Button
                        key={value}
                        variant={element!.style.verticalAlign === value ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateStyle({ verticalAlign: value as VerticalAlign })}
                        disabled={readOnly}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
          
          <Separator />
          
          {/* Layer Controls */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Layer</Label>
            
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Locked</Label>
              <Switch
                checked={element!.locked}
                onCheckedChange={(checked) => onElementUpdate(element!.id, { locked: checked })}
                disabled={readOnly}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Visible</Label>
              <Switch
                checked={element!.visible}
                onCheckedChange={(checked) => onElementUpdate(element!.id, { visible: checked })}
                disabled={readOnly}
              />
            </div>
            
            <div>
              <Label className="text-[10px] text-muted-foreground">Z-Index</Label>
              <Input
                type="number"
                value={element!.zIndex}
                onChange={(e) => onElementUpdate(element!.id, { zIndex: parseInt(e.target.value) || 0 })}
                className="h-7 text-xs mt-1"
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
