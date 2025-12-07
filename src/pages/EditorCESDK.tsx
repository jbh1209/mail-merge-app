import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CreativeEditorWrapper from '@/components/cesdk/CreativeEditorWrapper';

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

export default function EditorCESDK() {
  const navigate = useNavigate();
  const [labelWidth] = useState(100);
  const [labelHeight] = useState(50);

  const handleSave = useCallback((sceneString: string) => {
    console.log('Scene saved:', sceneString.substring(0, 100) + '...');
    toast.success('Design saved successfully');
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Minimal header - CE.SDK has its own toolbar for save/export/resize */}
      <header className="flex h-14 items-center border-b bg-card px-4">
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
      </header>

      {/* Editor container */}
      <main className="flex-1 overflow-hidden">
        <CreativeEditorWrapper
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
