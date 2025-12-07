import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Download, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CreativeEditorWrapper from '@/components/cesdk/CreativeEditorWrapper';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Sample data fields for demo
const DEMO_FIELDS = [
  'firstName',
  'lastName',
  'company',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'productName',
  'sku',
  'price',
  'barcode',
];

// Sample data for preview
const DEMO_SAMPLE_DATA: Record<string, string> = {
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp',
  email: 'john.smith@acme.com',
  phone: '(555) 123-4567',
  address: '123 Main Street',
  city: 'New York',
  state: 'NY',
  zip: '10001',
  productName: 'Widget Pro',
  sku: 'WGT-001',
  price: '$29.99',
  barcode: '123456789012',
};

// Preset label sizes
const LABEL_PRESETS = [
  { name: 'Custom', width: 100, height: 50 },
  { name: 'Address Label (4" x 2")', width: 101.6, height: 50.8 },
  { name: 'Shipping Label (4" x 6")', width: 101.6, height: 152.4 },
  { name: 'Product Label (2" x 1")', width: 50.8, height: 25.4 },
  { name: 'Name Badge (3.5" x 2.25")', width: 88.9, height: 57.15 },
  { name: 'Wine Label (4" x 3.3")', width: 101.6, height: 83.82 },
  { name: 'A7 (74mm x 105mm)', width: 74, height: 105 },
  { name: 'Business Card (85mm x 55mm)', width: 85, height: 55 },
];

export default function EditorCESDK() {
  const navigate = useNavigate();
  const [labelWidth, setLabelWidth] = useState(100);
  const [labelHeight, setLabelHeight] = useState(50);
  const [selectedPreset, setSelectedPreset] = useState('Custom');
  const [editorKey, setEditorKey] = useState(0);

  const handleSave = useCallback((sceneString: string) => {
    // For demo, just show a success message
    console.log('Scene saved:', sceneString.substring(0, 100) + '...');
    toast.success('Design saved successfully');
  }, []);

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = LABEL_PRESETS.find((p) => p.name === presetName);
    if (preset && presetName !== 'Custom') {
      setLabelWidth(preset.width);
      setLabelHeight(preset.height);
    }
  };

  const applyDimensions = () => {
    // Force re-render of editor with new dimensions
    setEditorKey((k) => k + 1);
    toast.success('Label size updated');
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Top toolbar */}
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            title="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">CE.SDK Design Editor</h1>
            <p className="text-xs text-muted-foreground">
              Variable Data Printing Demo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                Label Size
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Label Settings</SheetTitle>
                <SheetDescription>
                  Configure the label dimensions for your design.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <Label>Preset Sizes</Label>
                  <Select value={selectedPreset} onValueChange={handlePresetChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_PRESETS.map((preset) => (
                        <SelectItem key={preset.name} value={preset.name}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width (mm)</Label>
                    <Input
                      id="width"
                      type="number"
                      value={labelWidth}
                      onChange={(e) => {
                        setLabelWidth(Number(e.target.value));
                        setSelectedPreset('Custom');
                      }}
                      min={10}
                      max={500}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height (mm)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={labelHeight}
                      onChange={(e) => {
                        setLabelHeight(Number(e.target.value));
                        setSelectedPreset('Custom');
                      }}
                      min={10}
                      max={500}
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Current size: {labelWidth}mm × {labelHeight}mm
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ({(labelWidth / 25.4).toFixed(2)}" × {(labelHeight / 25.4).toFixed(2)}")
                  </p>
                </div>

                <Button onClick={applyDimensions} className="w-full">
                  Apply Size
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </header>

      {/* Editor container */}
      <main className="flex-1 overflow-hidden">
        <CreativeEditorWrapper
          key={editorKey}
          availableFields={DEMO_FIELDS}
          sampleData={DEMO_SAMPLE_DATA}
          onSave={handleSave}
          labelWidth={labelWidth}
          labelHeight={labelHeight}
        />
      </main>
    </div>
  );
}
