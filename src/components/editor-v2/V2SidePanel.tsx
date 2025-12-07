// =============================================================================
// V2 Editor Side Panel - Polotno-style tabbed panel
// =============================================================================

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Type,
  Square,
  Image,
  QrCode,
  Barcode,
  Database,
  Layers,
  Palette,
  FileText
} from 'lucide-react';
import type { DesignElement, DesignPage, TextElement, ShapeElement } from '@/lib/editor-v2/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';

type PanelTab = 'text' | 'shapes' | 'images' | 'data' | 'barcodes' | 'layers' | 'templates';

interface V2SidePanelProps {
  activePage: DesignPage;
  onAddElement: (element: DesignElement) => void;
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

export function V2SidePanel({ activePage, onAddElement }: V2SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('text');

  const handleAddText = (preset: 'heading' | 'body' | 'caption') => {
    const configs = {
      heading: { content: 'Heading', fontSize: 32, fontWeight: '700' as const },
      body: { content: 'Body text', fontSize: 14, fontWeight: 'normal' as const },
      caption: { content: 'Caption', fontSize: 10, fontWeight: 'normal' as const }
    };
    const config = configs[preset];
    
    const element: TextElement = {
      id: crypto.randomUUID(),
      kind: 'text',
      x: 20,
      y: 20,
      width: 80,
      height: 15,
      content: config.content,
      fontFamily: 'Inter',
      fontSize: config.fontSize,
      fontWeight: config.fontWeight
    };
    onAddElement(element);
  };

  const handleAddShape = (shape: 'rectangle' | 'ellipse' | 'line') => {
    const element: ShapeElement = {
      id: crypto.randomUUID(),
      kind: 'shape',
      shape,
      x: 30,
      y: 30,
      width: shape === 'line' ? 60 : 40,
      height: shape === 'line' ? 2 : 40,
      fill: shape === 'line' ? 'transparent' : '#e5e7eb',
      stroke: '#6b7280',
      strokeWidth: shape === 'line' ? 2 : 1
    };
    onAddElement(element);
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
                <div className="h-8 w-8 rounded-full border-2 border-current" />
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
            <Button variant="outline" className="w-full gap-2">
              <Image className="h-4 w-4" />
              Upload Image
            </Button>
            <p className="text-xs text-muted-foreground">
              Drag and drop images onto the canvas or upload from your device.
            </p>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Data Fields</h3>
            <p className="text-xs text-muted-foreground">
              Add merge fields from your data source. These will be replaced with actual data during generation.
            </p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-sm">
                <Database className="mr-2 h-4 w-4" />
                {"{{name}}"}
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm">
                <Database className="mr-2 h-4 w-4" />
                {"{{address}}"}
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm">
                <Database className="mr-2 h-4 w-4" />
                {"{{company}}"}
              </Button>
            </div>
          </div>
        );

      case 'barcodes':
        return (
          <div className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">Barcodes & QR</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Barcode className="h-4 w-4" />
                Add Barcode
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <QrCode className="h-4 w-4" />
                Add QR Code
              </Button>
            </div>
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
                {[...activePage.elements].reverse().map((element) => (
                  <div
                    key={element.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    {element.kind === 'text' && <Type className="h-4 w-4" />}
                    {element.kind === 'shape' && <Square className="h-4 w-4" />}
                    {element.kind === 'image' && <Image className="h-4 w-4" />}
                    <span className="truncate">
                      {element.kind === 'text' && 'content' in element
                        ? element.content.slice(0, 20)
                        : element.kind}
                    </span>
                  </div>
                ))}
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
                  className="aspect-[3/4] rounded-lg border bg-muted/30 hover:border-primary transition-colors cursor-pointer"
                />
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
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
  );
}