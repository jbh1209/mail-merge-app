// ============================================================================
// EDITOR LEFT SIDEBAR - Pages, Assets, and Data Fields
// ============================================================================

import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Layers, 
  Shapes, 
  Database,
  Type,
  Barcode,
  QrCode,
  Hash,
  MapPin,
  Image,
  Square
} from 'lucide-react';
import type { DesignPage, DesignElement, ElementKind, DesignDocument } from '@/lib/editor/types';
import { PageManagerPanel } from './PageManagerPanel';
import { ImageUploadDialog } from './ImageUploadDialog';
import { cn } from '@/lib/utils';

interface EditorLeftSidebarProps {
  document: DesignDocument;
  pages: DesignPage[];
  activePageIndex: number;
  onPageSelect: (index: number) => void;
  activeTab: 'pages' | 'assets' | 'data';
  onTabChange: (tab: 'pages' | 'assets' | 'data') => void;
  availableFields: string[];
  onAddElement: (element: DesignElement) => void;
  onDocumentUpdate: (updates: Partial<DesignDocument>) => void;
  onPageUpdate: (pageIndex: number, updates: Partial<DesignPage>) => void;
  pageSize: { width: number; height: number };
  readOnly?: boolean;
}

// Asset templates for quick insertion
const ASSET_TEMPLATES: Array<{
  kind: ElementKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  requiresDialog?: boolean;
}> = [
  { kind: 'text', label: 'Text', icon: Type, description: 'Single text field' },
  { kind: 'address_block', label: 'Address', icon: MapPin, description: 'Multi-line address' },
  { kind: 'barcode', label: 'Barcode', icon: Barcode, description: 'CODE128, EAN, UPC' },
  { kind: 'qr', label: 'QR Code', icon: QrCode, description: 'QR code from data' },
  { kind: 'sequence', label: 'Sequence', icon: Hash, description: 'Auto-incrementing number' },
  { kind: 'shape', label: 'Shape', icon: Square, description: 'Rectangle, circle, line' },
  { kind: 'image', label: 'Image', icon: Image, description: 'Upload with DPI check', requiresDialog: true },
];

export function EditorLeftSidebar({
  document,
  pages,
  activePageIndex,
  onPageSelect,
  activeTab,
  onTabChange,
  availableFields,
  onAddElement,
  onDocumentUpdate,
  onPageUpdate,
  pageSize,
  readOnly = false
}: EditorLeftSidebarProps) {
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  
  // Create element from template
  const createElementFromKind = (kind: ElementKind): DesignElement => {
    const base: DesignElement = {
      id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      kind,
      name: `New ${kind}`,
      x: 5,
      y: 5,
      width: pageSize.width * 0.5,
      height: 10,
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
    
    // Customize based on kind
    switch (kind) {
      case 'barcode':
        base.height = 12;
        base.config = { format: 'CODE128', showText: true };
        break;
      case 'qr':
        base.width = 15;
        base.height = 15;
        base.config = { errorCorrection: 'M' };
        break;
      case 'sequence':
        base.width = 20;
        base.height = 8;
        base.config = { startNumber: 1, padding: 4 };
        break;
      case 'address_block':
        base.height = 25;
        base.config = { combinedFields: [], separator: '\n' };
        break;
      case 'shape':
        base.width = 20;
        base.height = 20;
        base.config = { shapeType: 'rectangle' };
        base.style.fill = '#e5e5e5';
        base.style.stroke = '#000000';
        base.style.strokeWidth = 0.5;
        break;
      case 'image':
        base.width = 20;
        base.height = 20;
        base.config = { src: '' };
        break;
    }
    
    return base;
  };
  
  // Create text element from data field
  const createElementFromField = (fieldName: string): DesignElement => {
    return {
      id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      kind: 'text',
      name: fieldName,
      dataField: fieldName,
      x: 5,
      y: 5,
      width: pageSize.width * 0.5,
      height: 8,
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
  };
  
  // Handle asset click - either open dialog or add directly
  const handleAssetClick = (template: typeof ASSET_TEMPLATES[0]) => {
    if (template.requiresDialog && template.kind === 'image') {
      setImageDialogOpen(true);
    } else {
      onAddElement(createElementFromKind(template.kind));
    }
  };
  
  return (
    <div className="w-60 border-r bg-card flex flex-col">
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => onTabChange(v as typeof activeTab)}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-3 h-10 rounded-none border-b">
          <TabsTrigger value="pages" className="gap-1 text-xs">
            <Layers className="h-3.5 w-3.5" />
            Pages
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1 text-xs">
            <Shapes className="h-3.5 w-3.5" />
            Assets
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1 text-xs">
            <Database className="h-3.5 w-3.5" />
            Data
          </TabsTrigger>
        </TabsList>
        
        {/* Pages Tab - Now using PageManagerPanel */}
        <TabsContent value="pages" className="flex-1 m-0 p-3">
          <PageManagerPanel
            document={document}
            activePageIndex={activePageIndex}
            onPageSelect={onPageSelect}
            onDocumentUpdate={onDocumentUpdate}
            onPageUpdate={onPageUpdate}
            readOnly={readOnly}
          />
        </TabsContent>
        
        {/* Assets Tab */}
        <TabsContent value="assets" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-3">
                Click to add to canvas
              </p>
              <div className="space-y-1.5">
                {ASSET_TEMPLATES.map((template) => {
                  const Icon = template.icon;
                  return (
                    <Button
                      key={template.kind}
                      variant="ghost"
                      className="w-full justify-start h-auto py-2 px-3"
                      onClick={() => handleAssetClick(template)}
                      disabled={readOnly}
                    >
                      <Icon className="h-4 w-4 mr-3 shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{template.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
        
        {/* Data Fields Tab */}
        <TabsContent value="data" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-3">
              {availableFields.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No data fields available
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload a data source to see fields
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Click a field to add it as text
                  </p>
                  <div className="space-y-1">
                    {availableFields.map((field) => (
                      <Button
                        key={field}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start font-mono text-xs"
                        onClick={() => onAddElement(createElementFromField(field))}
                        disabled={readOnly}
                      >
                        <Type className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" />
                        {field}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      
      {/* Image Upload Dialog */}
      <ImageUploadDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
        onImageAdd={onAddElement}
        pageSize={pageSize}
      />
    </div>
  );
}
