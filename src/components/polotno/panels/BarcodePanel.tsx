/* eslint-disable @typescript-eslint/no-explicit-any */
import { QrCode, Barcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useState } from 'react';
import { generateBarcodeDataUrl, generateQRCodeDataUrl } from '@/lib/barcode-svg-utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BarcodePanelProps {
  store: any;
  availableFields: string[];
  /** Called immediately after inserting a barcode/QR to commit to base template */
  onInserted?: () => void;
}

const BARCODE_FORMATS = [
  { value: 'code128', label: 'Code 128' },
  { value: 'code39', label: 'Code 39' },
  { value: 'ean13', label: 'EAN-13' },
  { value: 'ean8', label: 'EAN-8' },
  { value: 'upca', label: 'UPC-A' },
  { value: 'itf14', label: 'ITF-14' },
];

export function BarcodePanel({ store, availableFields, onInserted }: BarcodePanelProps) {
  const [barcodeType, setBarcodeType] = useState<'barcode' | 'qrcode'>('barcode');
  const [format, setFormat] = useState('code128');
  const [dataSource, setDataSource] = useState<'static' | 'field'>('static');
  const [staticValue, setStaticValue] = useState('12345678');
  const [variableField, setVariableField] = useState(availableFields[0] || '');

  const handleInsertBarcode = async () => {
    const page = store.activePage;
    if (!page) return;

    try {
      // Use appropriate dimensions for QR codes (square) vs barcodes (rectangular)
      const isQR = barcodeType === 'qrcode';
      const elementWidth = isQR ? 120 : 150;
      const elementHeight = isQR ? 120 : 50; // QR codes are square, barcodes are wide
      
      const dataUrl = isQR
        ? generateQRCodeDataUrl(dataSource === 'static' ? staticValue : 'SAMPLE')
        : generateBarcodeDataUrl(dataSource === 'static' ? staticValue : '12345678', format);

      page.addElement({
        type: 'image',
        x: page.width / 2 - elementWidth / 2,
        y: page.height / 2 - elementHeight / 2,
        width: elementWidth,
        height: elementHeight,
        src: dataUrl,
        custom: {
          barcodeConfig: {
            type: barcodeType,
            format: isQR ? 'qrcode' : format,
            dataSource,
            staticValue: dataSource === 'static' ? staticValue : undefined,
            variableField: dataSource === 'field' ? variableField : undefined,
          },
        },
      });
      
      // CRITICAL: Immediately commit to base template to prevent loss on record navigation
      // Small delay to ensure Polotno has processed the addElement
      setTimeout(() => {
        onInserted?.();
      }, 50);
    } catch (error) {
      console.error('Failed to generate barcode:', error);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Barcodes & QR Codes</h3>
      
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Type</Label>
            <RadioGroup
              value={barcodeType}
              onValueChange={(v) => setBarcodeType(v as 'barcode' | 'qrcode')}
              className="flex gap-4 mt-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="barcode" id="barcode" />
                <Label htmlFor="barcode" className="text-xs flex items-center gap-1">
                  <Barcode className="h-3 w-3" />
                  Barcode
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="qrcode" id="qrcode" />
                <Label htmlFor="qrcode" className="text-xs flex items-center gap-1">
                  <QrCode className="h-3 w-3" />
                  QR Code
                </Label>
              </div>
            </RadioGroup>
          </div>

          {barcodeType === 'barcode' && (
            <div>
              <Label className="text-xs">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Data Source</Label>
            <RadioGroup
              value={dataSource}
              onValueChange={(v) => setDataSource(v as 'static' | 'field')}
              className="flex gap-4 mt-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="static" id="static" />
                <Label htmlFor="static" className="text-xs">Static Value</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="field" id="field" />
                <Label htmlFor="field" className="text-xs">Data Field</Label>
              </div>
            </RadioGroup>
          </div>

          {dataSource === 'static' ? (
            <div>
              <Label className="text-xs">Value</Label>
              <Input
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Enter barcode value"
                className="h-8 text-xs mt-1"
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Field</Label>
              <Select value={variableField} onValueChange={setVariableField}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleInsertBarcode} className="w-full">
            Insert {barcodeType === 'qrcode' ? 'QR Code' : 'Barcode'}
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
