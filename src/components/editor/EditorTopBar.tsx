// ============================================================================
// EDITOR TOP BAR - Tools, Actions, and Zoom Controls
// ============================================================================

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Save, 
  Download, 
  X, 
  ZoomIn, 
  ZoomOut, 
  Grid3X3, 
  Undo2, 
  Redo2,
  Type,
  Image,
  Square,
  QrCode,
  Barcode,
  Hash,
  MapPin,
  Trash2,
  Maximize
} from 'lucide-react';
import type { DesignElement, ElementKind } from '@/lib/editor/types';

interface EditorTopBarProps {
  documentName: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  onSave?: () => void;
  onExport?: () => void;
  onClose?: () => void;
  onAddElement: (element: DesignElement) => void;
  selectedElements: DesignElement[];
  onDeleteSelected: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  pageSize: { width: number; height: number };
  readOnly?: boolean;
}

const ZOOM_PRESETS = [
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 3, label: '300%' },
];

export function EditorTopBar({
  documentName,
  zoom,
  onZoomChange,
  showGrid,
  onShowGridChange,
  onSave,
  onExport,
  onClose,
  onAddElement,
  selectedElements,
  onDeleteSelected,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  pageSize,
  readOnly = false
}: EditorTopBarProps) {
  
  // Create a new element of the specified type
  const createNewElement = (kind: ElementKind): DesignElement => {
    const baseElement: DesignElement = {
      id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      kind,
      name: `New ${kind}`,
      x: pageSize.width / 4,
      y: pageSize.height / 4,
      width: pageSize.width / 2,
      height: kind === 'text' ? 8 : 15,
      zIndex: 100,
      locked: false,
      visible: true,
      style: {
        fontSize: 12,
        fontFamily: 'Roboto',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        verticalAlign: 'top',
        color: '#000000'
      },
      overflow: 'wrap',
      autoFit: true
    };
    
    // Adjust defaults based on element type
    switch (kind) {
      case 'text':
        baseElement.height = 8;
        break;
      case 'barcode':
        baseElement.height = 12;
        baseElement.width = Math.min(40, pageSize.width * 0.6);
        baseElement.config = { format: 'CODE128', showText: true };
        break;
      case 'qr':
        baseElement.width = 15;
        baseElement.height = 15;
        baseElement.config = { errorCorrection: 'M' };
        break;
      case 'sequence':
        baseElement.height = 8;
        baseElement.width = 20;
        baseElement.config = { startNumber: 1, padding: 4 };
        break;
      case 'address_block':
        baseElement.height = 25;
        baseElement.config = { combinedFields: [], separator: '\n' };
        break;
      case 'shape':
        baseElement.width = 20;
        baseElement.height = 20;
        baseElement.config = { shapeType: 'rectangle' };
        baseElement.style.fill = '#e5e5e5';
        baseElement.style.stroke = '#000000';
        baseElement.style.strokeWidth = 0.5;
        break;
      case 'image':
        baseElement.width = 20;
        baseElement.height = 20;
        baseElement.config = { src: '' };
        break;
    }
    
    return baseElement;
  };
  
  const handleAddElement = (kind: ElementKind) => {
    const element = createNewElement(kind);
    onAddElement(element);
  };
  
  return (
    <div className="flex items-center justify-between h-12 px-3 border-b bg-card">
      {/* Left Section - Document Name & Actions */}
      <div className="flex items-center gap-2">
        {/* Close button */}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        
        {/* Document name */}
        <span className="font-medium text-sm truncate max-w-[200px]">
          {documentName}
        </span>
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo || readOnly}
            className="h-8 w-8"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo || readOnly}
            className="h-8 w-8"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Center Section - Add Element & Tools */}
      <div className="flex items-center gap-2">
        {/* Add Element Dropdown */}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Element
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuItem onClick={() => handleAddElement('text')}>
                <Type className="h-4 w-4 mr-2" />
                Text Field
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddElement('address_block')}>
                <MapPin className="h-4 w-4 mr-2" />
                Address Block
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddElement('barcode')}>
                <Barcode className="h-4 w-4 mr-2" />
                Barcode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddElement('qr')}>
                <QrCode className="h-4 w-4 mr-2" />
                QR Code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddElement('sequence')}>
                <Hash className="h-4 w-4 mr-2" />
                Sequence Number
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddElement('shape')}>
                <Square className="h-4 w-4 mr-2" />
                Shape
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddElement('image')}>
                <Image className="h-4 w-4 mr-2" />
                Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {/* Delete selected */}
        {selectedElements.length > 0 && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeleteSelected}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Grid toggle */}
        <Button
          variant={showGrid ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => onShowGridChange(!showGrid)}
          className="h-8 w-8"
          title="Toggle Grid"
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
        
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <Select
            value={zoom.toString()}
            onValueChange={(value) => onZoomChange(parseFloat(value))}
          >
            <SelectTrigger className="w-[80px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZOOM_PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value.toString()}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onZoomChange(1)}
            className="h-8 w-8"
            title="Actual Size (100%)"
          >
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Right Section - Save & Export */}
      <div className="flex items-center gap-2">
        {onSave && !readOnly && (
          <Button variant="outline" size="sm" onClick={onSave} className="gap-1.5">
            <Save className="h-4 w-4" />
            Save
          </Button>
        )}
        
        {onExport && (
          <Button variant="default" size="sm" onClick={onExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
      </div>
    </div>
  );
}
