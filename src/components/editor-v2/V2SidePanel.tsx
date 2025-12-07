// =============================================================================
// V2 Editor Side Panel - Polotno-style tabbed panel with full functionality
// =============================================================================

import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Type,
  Square,
  Image,
  QrCode,
  Barcode,
  Database,
  Layers,
  FileText,
  Upload,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Circle
} from 'lucide-react';
import type { DesignElement, DesignPage, TextElement, ShapeElement, ImageElement } from '@/lib/editor-v2/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

type PanelTab = 'text' | 'shapes' | 'images' | 'data' | 'barcodes' | 'layers' | 'templates';

interface V2SidePanelProps {
  activePage: DesignPage;
  selectedElementIds: string[];
  onAddElement: (element: DesignElement) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<DesignElement>) => void;
  onRemoveElement: (elementId: string) => void;
}

const tabs: { id: PanelTab; icon: React.ElementType; label: string }[] = [
  { id: 'templates', icon: FileText, label: 'Templates' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'shapes', icon: Square, label: 'Shapes' },
  { id: 'images', icon: Image, label: 'Images' },
  { id: 'data', icon: Database, label: 'Data Fields' },
  { id: 'barcodes', icon: Barcode, label: 'Barcodes' },
  { id: 'layers', icon: Layers, label: 'Layers' }
];

// Barcode/QR dialog state
interface BarcodeDialogState {
  open: boolean;
  type: 'barcode' | 'qrcode';
  value: string;
  format: string;
}

export function V2SidePanel({ 
  activePage, 
  selectedElementIds,
  onAddElement, 
  onSelectElement,
  onUpdateElement,
  onRemoveElement 
}: V2SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('shapes');
  const [barcodeDialog, setBarcodeDialog] = useState<BarcodeDialogState>({
    open: false,
    type: 'barcode',
    value: '',
    format: 'code128'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddText = (preset: 'heading' | 'body' | 'caption') => {
    const configs = {
      heading: { content: 'Heading', fontSize: 32, fontWeight: '700' as const, height: 40 },
      body: { content: 'Body text goes here', fontSize: 14, fontWeight: 'normal' as const, height: 20 },
      caption: { content: 'Caption text', fontSize: 10, fontWeight: 'normal' as const, height: 14 }
    };
    const config = configs[preset];
    
    const element: TextElement = {
      id: crypto.randomUUID(),
      kind: 'text',
      x: 20,
      y: 20,
      width: 100,
      height: config.height,
      content: config.content,
      fontFamily: 'Inter',
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      color: '#1e293b'
    };
    onAddElement(element);
    toast.success(`Added ${preset} text`);
  };

  const handleAddShape = (shape: 'rectangle' | 'ellipse' | 'line') => {
    const element: ShapeElement = {
      id: crypto.randomUUID(),
      kind: 'shape',
      shape,
      x: 30,
      y: 30,
      width: shape === 'line' ? 80 : 50,
      height: shape === 'line' ? 2 : 50,
      fill: shape === 'line' ? 'transparent' : '#dbeafe',
      stroke: shape === 'line' ? '#3b82f6' : '#3b82f6',
      strokeWidth: shape === 'line' ? 3 : 2
    };
    onAddElement(element);
    toast.success(`Added ${shape}`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Create a local URL for the image
    const url = URL.createObjectURL(file);
    
    // Create image element to get dimensions
    const img = new window.Image();
    img.onload = () => {
      // Calculate aspect ratio and fit within reasonable bounds
      const maxWidth = 100; // mm
      const aspectRatio = img.width / img.height;
      const width = Math.min(maxWidth, img.width / 3); // Scale down
      const height = width / aspectRatio;

      const element: ImageElement = {
        id: crypto.randomUUID(),
        kind: 'image',
        x: 20,
        y: 20,
        width,
        height,
        src: url,
        fit: 'contain'
      };
      onAddElement(element);
      toast.success('Image added to canvas');
    };
    img.onerror = () => {
      toast.error('Failed to load image');
      URL.revokeObjectURL(url);
    };
    img.src = url;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddBarcode = () => {
    setBarcodeDialog({ open: true, type: 'barcode', value: '123456789', format: 'code128' });
  };

  const handleAddQRCode = () => {
    setBarcodeDialog({ open: true, type: 'qrcode', value: 'https://example.com', format: 'qrcode' });
  };

  const handleConfirmBarcode = () => {
    // For now, add as a shape placeholder with text - actual barcode rendering would need barcode generation
    const element: ShapeElement = {
      id: crypto.randomUUID(),
      kind: 'shape',
      shape: 'rectangle',
      x: 20,
      y: 20,
      width: barcodeDialog.type === 'qrcode' ? 30 : 60,
      height: barcodeDialog.type === 'qrcode' ? 30 : 20,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 1
    };
    onAddElement(element);
    toast.success(`Added ${barcodeDialog.type === 'qrcode' ? 'QR Code' : 'Barcode'} placeholder`);
    setBarcodeDialog(prev => ({ ...prev, open: false }));
  };

  const handleAddDataField = (fieldName: string) => {
    const element: TextElement = {
      id: crypto.randomUUID(),
      kind: 'text',
      x: 20,
      y: 20,
      width: 60,
      height: 16,
      content: `{{${fieldName}}}`,
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: 'normal',
      color: '#3b82f6',
      binding: { field: fieldName }
    };
    onAddElement(element);
    toast.success(`Added {{${fieldName}}} field`);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'text':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Add Text</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleAddText('heading')}
              >
                <span className="text-2xl font-bold">Aa</span>
                <div className="text-left">
                  <div className="font-medium">Heading</div>
                  <div className="text-xs text-muted-foreground">Large, bold text</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleAddText('body')}
              >
                <span className="text-base">Aa</span>
                <div className="text-left">
                  <div className="font-medium">Body</div>
                  <div className="text-xs text-muted-foreground">Regular paragraph text</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleAddText('caption')}
              >
                <span className="text-xs">Aa</span>
                <div className="text-left">
                  <div className="font-medium">Caption</div>
                  <div className="text-xs text-muted-foreground">Small, subtle text</div>
                </div>
              </Button>
            </div>
          </div>
        );

      case 'shapes':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Basic Shapes</h3>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="aspect-square h-auto flex-col gap-1 p-3"
                onClick={() => handleAddShape('rectangle')}
              >
                <div className="h-8 w-8 rounded border-2 border-current" />
                <span className="text-xs">Rectangle</span>
              </Button>
              <Button
                variant="outline"
                className="aspect-square h-auto flex-col gap-1 p-3"
                onClick={() => handleAddShape('ellipse')}
              >
                <Circle className="h-8 w-8" strokeWidth={2} />
                <span className="text-xs">Circle</span>
              </Button>
              <Button
                variant="outline"
                className="aspect-square h-auto flex-col gap-1 p-3"
                onClick={() => handleAddShape('line')}
              >
                <div className="h-8 w-8 flex items-center justify-center">
                  <div className="h-0.5 w-full bg-current" />
                </div>
                <span className="text-xs">Line</span>
              </Button>
            </div>
          </div>
        );

      case 'images':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Images</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload Image
            </Button>
            <p className="text-xs text-muted-foreground">
              Supported formats: JPG, PNG, GIF, SVG, WebP
            </p>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Data Fields</h3>
            <p className="text-xs text-muted-foreground">
              Click to add a merge field. These will be replaced with data during generation.
            </p>
            <div className="space-y-2">
              {['name', 'address', 'company', 'email', 'phone', 'date'].map(field => (
                <Button 
                  key={field}
                  variant="outline" 
                  className="w-full justify-start text-sm"
                  onClick={() => handleAddDataField(field)}
                >
                  <Database className="mr-2 h-4 w-4 text-primary" />
                  {`{{${field}}}`}
                </Button>
              ))}
            </div>
          </div>
        );

      case 'barcodes':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Barcodes & QR</h3>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2"
                onClick={handleAddBarcode}
              >
                <Barcode className="h-4 w-4" />
                Add Barcode
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2"
                onClick={handleAddQRCode}
              >
                <QrCode className="h-4 w-4" />
                Add QR Code
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Barcodes can be linked to data fields for variable data printing.
            </p>
          </div>
        );

      case 'layers':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Layers</h3>
            {activePage.elements.length === 0 ? (
              <p className="text-xs text-muted-foreground">No elements on this page.</p>
            ) : (
              <div className="space-y-1">
                {[...activePage.elements].reverse().map((element) => {
                  const isSelected = selectedElementIds.includes(element.id);
                  return (
                    <div
                      key={element.id}
                      onClick={() => onSelectElement(element.id)}
                      className={cn(
                        'flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer transition-colors',
                        isSelected 
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/20' 
                          : 'hover:bg-muted/50'
                      )}
                    >
                      {element.kind === 'text' && <Type className="h-4 w-4 flex-shrink-0" />}
                      {element.kind === 'shape' && <Square className="h-4 w-4 flex-shrink-0" />}
                      {element.kind === 'image' && <Image className="h-4 w-4 flex-shrink-0" />}
                      
                      <span className="truncate flex-1">
                        {element.kind === 'text' && 'content' in element
                          ? element.content.slice(0, 20) || 'Text'
                          : element.kind === 'shape' && 'shape' in element
                          ? element.shape
                          : element.kind}
                      </span>

                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateElement(element.id, { hidden: !element.hidden });
                          }}
                          className="p-0.5 hover:text-primary"
                          title={element.hidden ? 'Show' : 'Hide'}
                        >
                          {element.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateElement(element.id, { locked: !element.locked });
                          }}
                          className="p-0.5 hover:text-primary"
                          title={element.locked ? 'Unlock' : 'Lock'}
                        >
                          {element.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveElement(element.id);
                          }}
                          className="p-0.5 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Templates</h3>
            <p className="text-xs text-muted-foreground">
              Start from a pre-designed template or create your own.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-lg border bg-muted/30 hover:border-primary transition-colors cursor-pointer flex items-center justify-center"
                >
                  <span className="text-xs text-muted-foreground">Template {i}</span>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="flex h-full border-r bg-card">
        {/* Icon Tabs */}
        <div className="flex w-14 flex-col items-center gap-1 border-r py-2">
          {tabs.map((tab) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tab.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Panel Content */}
        <ScrollArea className="w-64">
          {renderTabContent()}
        </ScrollArea>
      </div>

      {/* Barcode/QR Dialog */}
      <Dialog 
        open={barcodeDialog.open} 
        onOpenChange={(open) => setBarcodeDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {barcodeDialog.type === 'qrcode' ? 'QR Code' : 'Barcode'}
            </DialogTitle>
            <DialogDescription>
              Enter the value for your {barcodeDialog.type === 'qrcode' ? 'QR code' : 'barcode'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={barcodeDialog.value}
                onChange={(e) => setBarcodeDialog(prev => ({ ...prev, value: e.target.value }))}
                placeholder={barcodeDialog.type === 'qrcode' ? 'https://example.com' : '123456789'}
              />
            </div>
            {barcodeDialog.type === 'barcode' && (
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={barcodeDialog.format}
                  onValueChange={(value) => setBarcodeDialog(prev => ({ ...prev, format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code128">Code 128</SelectItem>
                    <SelectItem value="code39">Code 39</SelectItem>
                    <SelectItem value="ean13">EAN-13</SelectItem>
                    <SelectItem value="upc">UPC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarcodeDialog(prev => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button onClick={handleConfirmBarcode}>
              Add to Canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
