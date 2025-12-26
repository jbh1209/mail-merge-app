import { useNavigate } from 'react-router-dom';
import { DesignEditorWithFabric } from '@/components/editor/DesignEditorWithFabric';
import { useToast } from '@/hooks/use-toast';

// Mock template for demo
const mockTemplate = {
  id: 'demo-template',
  name: 'Demo Label Template',
  width_mm: 100,
  height_mm: 50,
  design_config: {
    fields: []
  }
};

// Mock available fields (typical VDP fields)
const mockAvailableFields = [
  'Name',
  'Company',
  'Address',
  'City',
  'State',
  'Zip',
  'Country',
  'Email',
  'Phone',
  'SKU',
  'Product Name',
  'Price',
  'Barcode',
  'QR Code',
  'Logo'
];

// Mock sample data records
const mockSampleData = [
  {
    Name: 'John Smith',
    Company: 'Acme Corp',
    Address: '123 Main Street',
    City: 'New York',
    State: 'NY',
    Zip: '10001',
    Country: 'USA',
    Email: 'john@acme.com',
    Phone: '(555) 123-4567',
    SKU: 'PROD-001',
    'Product Name': 'Widget Pro',
    Price: '$29.99',
    Barcode: '1234567890123',
    'QR Code': 'https://example.com/product/1',
    Logo: ''
  },
  {
    Name: 'Jane Doe',
    Company: 'TechStart Inc',
    Address: '456 Oak Avenue',
    City: 'San Francisco',
    State: 'CA',
    Zip: '94102',
    Country: 'USA',
    Email: 'jane@techstart.io',
    Phone: '(555) 987-6543',
    SKU: 'PROD-002',
    'Product Name': 'Gadget X',
    Price: '$49.99',
    Barcode: '9876543210987',
    'QR Code': 'https://example.com/product/2',
    Logo: ''
  },
  {
    Name: 'Bob Johnson',
    Company: 'Global Logistics',
    Address: '789 Industrial Blvd',
    City: 'Chicago',
    State: 'IL',
    Zip: '60601',
    Country: 'USA',
    Email: 'bob@globallogistics.com',
    Phone: '(555) 456-7890',
    SKU: 'PROD-003',
    'Product Name': 'Shipping Label Kit',
    Price: '$19.99',
    Barcode: '5555555555555',
    'QR Code': 'https://example.com/product/3',
    Logo: ''
  }
];

export default function EditorDemo() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSave = (designConfig: any) => {
    console.log('Demo save - design config:', designConfig);
    toast({
      title: 'Design Saved (Demo)',
      description: 'In production, this would save to the database.',
    });
  };

  const handleClose = () => {
    navigate('/dashboard');
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <DesignEditorWithFabric
        template={mockTemplate}
        projectId="demo-project"
        sampleData={mockSampleData}
        availableFields={mockAvailableFields}
        onSave={handleSave}
        onClose={handleClose}
      />
    </div>
  );
}
