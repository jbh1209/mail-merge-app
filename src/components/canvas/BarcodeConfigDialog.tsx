import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldConfig } from '@/lib/canvas-utils';
import { AlertTriangle } from 'lucide-react';

interface BarcodeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: Partial<FieldConfig>) => void;
  templateSize: { width: number; height: number };
  availableFields?: string[];
}

export function BarcodeConfigDialog({
  open,
  onOpenChange,
  onConfirm,
  templateSize,
  availableFields = []
}: BarcodeConfigDialogProps) {
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'CODE39' | 'EAN13' | 'UPC'>('CODE128');
  const [dataSource, setDataSource] = useState<'static' | 'field'>('field');
  const [staticValue, setStaticValue] = useState('');
  const [selectedField, setSelectedField] = useState('');

  const handleConfirm = () => {
    const dataValue = dataSource === 'static' ? staticValue : selectedField;
    
    if (!dataValue) {
      return;
    }

    const fieldConfig: Partial<FieldConfig> = {
      id: `field-${crypto.randomUUID()}`,
      templateField: dataSource === 'static' ? `BARCODE_${staticValue.slice(0, 10)}` : selectedField,
      position: { 
        x: Math.max(5, (templateSize.width - 40) / 2), 
        y: Math.max(5, (templateSize.height - 15) / 2)
      },
      size: { width: 40, height: 15 },
      style: {
        fontSize: 12,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#000000',
        verticalAlign: 'middle'
      },
      fieldType: 'barcode',
      typeConfig: {
        barcodeFormat,
        ...(dataSource === 'static' && { staticValue })
      },
      showLabel: false,
      overflow: 'shrink',
      autoFit: false
    };

    onConfirm(fieldConfig);
    onOpenChange(false);
    
    // Reset form
    setStaticValue('');
    setSelectedField('');
  };

  const canConfirm = dataSource === 'static' ? staticValue.trim().length > 0 : selectedField.length > 0;

  const getBarcodeInfo = (format: string) => {
    const info: Record<string, { description: string; minSize: string; example: string }> = {
      CODE128: {
        description: 'Most versatile, supports all ASCII characters',
        minSize: '30×15mm',
        example: 'ABC-123-XYZ'
      },
      CODE39: {
        description: 'Alphanumeric barcode, widely used',
        minSize: '35×15mm',
        example: 'PROD-12345'
      },
      EAN13: {
        description: 'Retail products (13 digits)',
        minSize: '30×21mm',
        example: '5901234123457'
      },
      UPC: {
        description: 'North American products (12 digits)',
        minSize: '30×21mm',
        example: '012345678905'
      }
    };
    return info[format];
  };

  const info = getBarcodeInfo(barcodeFormat);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Barcode</DialogTitle>
          <DialogDescription>
            Configure barcode format and data source
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="format">Barcode Format</Label>
            <Select value={barcodeFormat} onValueChange={(v) => setBarcodeFormat(v as any)}>
              <SelectTrigger id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CODE128">CODE128</SelectItem>
                <SelectItem value="CODE39">CODE39</SelectItem>
                <SelectItem value="EAN13">EAN-13</SelectItem>
                <SelectItem value="UPC">UPC-A</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{info.description}</div>
              <div className="text-amber-600 dark:text-amber-500">
                Minimum: {info.minSize}
              </div>
              <div>Example: <code className="font-mono">{info.example}</code></div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Data Source</Label>
            <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as 'static' | 'field')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="field" id="field" />
                <Label htmlFor="field" className="font-normal cursor-pointer">
                  From Data Field
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="static" id="static" />
                <Label htmlFor="static" className="font-normal cursor-pointer">
                  Static Value
                </Label>
              </div>
            </RadioGroup>
          </div>

          {dataSource === 'field' ? (
            <div className="space-y-2">
              <Label htmlFor="dataField">Select Data Field</Label>
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger id="dataField">
                  <SelectValue placeholder="Choose a field..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.length === 0 ? (
                    <SelectItem value="none" disabled>No fields available</SelectItem>
                  ) : (
                    availableFields.map(field => (
                      <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Different barcode per label based on data
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="staticValue">Barcode Value</Label>
              <Input
                id="staticValue"
                placeholder={`e.g., ${info.example}`}
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                Same barcode on all labels
              </p>
            </div>
          )}
          
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Minimum size for scanning:</strong> {info.minSize}<br />
              Smaller barcodes may not scan reliably. Recommended: 40×30mm for best results.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Add to Canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
