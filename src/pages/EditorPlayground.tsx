// ============================================================================
// EDITOR PLAYGROUND - Standalone Design Editor Testing Page
// ============================================================================
// A sandbox page for testing the design editor without auth, projects, or data.
// Allows adding elements, adjusting layout, and exporting to PDF.
// ============================================================================

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DesignEditorWithFabric } from '@/components/editor/DesignEditorWithFabric';
import { AVERY_LABELS } from '@/lib/avery-labels';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

// Standard template sizes
const STANDARD_SIZES = [
  { id: 'business-card', name: 'Business Card', width: 89, height: 51 },
  { id: 'a6', name: 'A6', width: 105, height: 148 },
  { id: 'a7', name: 'A7', width: 74, height: 105 },
  { id: 'postcard-4x6', name: 'Postcard (4x6")', width: 152, height: 102 },
  { id: 'badge', name: 'Name Badge', width: 86, height: 55 },
  { id: 'shelf-strip', name: 'Shelf Strip', width: 100, height: 30 },
];

// Mock template for the editor
interface MockTemplate {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  design_config: {
    fields: any[];
    background?: string;
  };
}

export default function EditorPlayground() {
  // Size selection state
  const [sizeCategory, setSizeCategory] = useState<'avery' | 'standard' | 'custom'>('standard');
  const [selectedAvery, setSelectedAvery] = useState(AVERY_LABELS[0]?.id || '');
  const [selectedStandard, setSelectedStandard] = useState('business-card');
  const [customWidth, setCustomWidth] = useState(89);
  const [customHeight, setCustomHeight] = useState(51);
  
  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useState<MockTemplate | null>(null);
  
  // Get current dimensions based on selection
  const getCurrentDimensions = useCallback(() => {
    if (sizeCategory === 'avery') {
      const avery = AVERY_LABELS.find(l => l.id === selectedAvery);
      return avery ? { width: avery.width_mm, height: avery.height_mm } : { width: 89, height: 51 };
    } else if (sizeCategory === 'standard') {
      const standard = STANDARD_SIZES.find(s => s.id === selectedStandard);
      return standard ? { width: standard.width, height: standard.height } : { width: 89, height: 51 };
    } else {
      return { width: customWidth, height: customHeight };
    }
  }, [sizeCategory, selectedAvery, selectedStandard, customWidth, customHeight]);
  
  // Start editing with selected size
  const handleStartEditor = () => {
    const dims = getCurrentDimensions();
    const sizeName = sizeCategory === 'avery' 
      ? `Avery ${selectedAvery}`
      : sizeCategory === 'standard'
        ? STANDARD_SIZES.find(s => s.id === selectedStandard)?.name || 'Custom'
        : `Custom ${dims.width}×${dims.height}mm`;
    
    setTemplate({
      id: 'playground-template',
      name: `Playground - ${sizeName}`,
      width_mm: dims.width,
      height_mm: dims.height,
      design_config: {
        fields: [],
        background: '#ffffff'
      }
    });
    setIsEditing(true);
  };
  
  // Reset and go back to size selection
  const handleReset = () => {
    setIsEditing(false);
    setTemplate(null);
  };
  
  // Handle save (just logs for now - no project to save to)
  const handleSave = useCallback((designConfig: any) => {
    console.log('Design saved (localStorage):', designConfig);
    // Could persist to localStorage here
    localStorage.setItem('playground-design', JSON.stringify(designConfig));
  }, []);
  
  // Handle close
  const handleClose = () => {
    handleReset();
  };
  
  // If editing, show the full editor
  if (isEditing && template) {
    return (
      <div className="h-screen w-screen">
        <DesignEditorWithFabric
          template={template}
          projectId="playground"
          sampleData={[]}
          availableFields={[]}
          onSave={handleSave}
          onClose={handleClose}
        />
      </div>
    );
  }
  
  // Size selection UI
  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold">Design Editor Playground</h1>
          <p className="text-muted-foreground mt-2">
            Test the design editor without any data sources. Add text, QR codes, barcodes, images, and export to PDF.
          </p>
        </div>
        
        {/* Size Selection Card */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Choose Template Size</h2>
            
            <Tabs value={sizeCategory} onValueChange={(v) => setSizeCategory(v as any)}>
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="standard">Standard</TabsTrigger>
                <TabsTrigger value="avery">Avery Labels</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
              
              <TabsContent value="standard" className="space-y-4">
                <div>
                  <Label>Select Size</Label>
                  <Select value={selectedStandard} onValueChange={setSelectedStandard}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_SIZES.map(size => (
                        <SelectItem key={size.id} value={size.id}>
                          {size.name} ({size.width} × {size.height} mm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              
              <TabsContent value="avery" className="space-y-4">
                <div>
                  <Label>Select Avery Label</Label>
                  <Select value={selectedAvery} onValueChange={setSelectedAvery}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVERY_LABELS.map(label => (
                        <SelectItem key={label.id} value={label.id}>
                          {label.averyCode} - {label.name} ({label.width_mm} × {label.height_mm} mm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              
              <TabsContent value="custom" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Width (mm)</Label>
                    <Input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      min={10}
                      max={500}
                    />
                  </div>
                  <div>
                    <Label>Height (mm)</Label>
                    <Input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      min={10}
                      max={500}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            {/* Preview dimensions */}
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Selected size: <span className="font-medium text-foreground">
                  {getCurrentDimensions().width} × {getCurrentDimensions().height} mm
                </span>
              </p>
            </div>
            
            {/* Action buttons */}
            <div className="mt-6 flex gap-3">
              <Button onClick={handleStartEditor} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Open Editor
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Features list */}
        <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-background rounded-lg border">
            <h3 className="font-medium mb-2">✓ Available Features</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Add text elements</li>
              <li>• Add QR codes & barcodes</li>
              <li>• Upload images</li>
              <li>• Add shapes</li>
              <li>• Background colors</li>
              <li>• Multi-page documents</li>
              <li>• PDF export</li>
            </ul>
          </div>
          <div className="p-4 bg-background rounded-lg border">
            <h3 className="font-medium mb-2">✗ Not in Playground</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Data binding (VDP)</li>
              <li>• AI layout suggestions</li>
              <li>• Save to project</li>
              <li>• Field mappings</li>
              <li>• Merge jobs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
