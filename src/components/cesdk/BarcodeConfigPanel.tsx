import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { generateBarcodeDataUrl, generateQRCodeDataUrl, getValidSampleValue, validateBarcodeInput } from '@/lib/barcode-svg-utils';

interface BarcodeConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: BarcodeConfig) => void;
  availableFields?: string[];
  initialConfig?: Partial<BarcodeConfig>;
  type: 'barcode' | 'qrcode';
}

export interface BarcodeConfig {
  type: 'barcode' | 'qrcode';
  format: string;
  dataSource: 'static' | 'field';
  staticValue: string;
  variableField: string;
}

const BARCODE_FORMATS = [
  { id: 'code128', label: 'Code 128', description: 'Alphanumeric, variable length' },
  { id: 'code39', label: 'Code 39', description: 'Alphanumeric, variable length' },
  { id: 'ean13', label: 'EAN-13', description: '13-digit numeric (retail)' },
  { id: 'upca', label: 'UPC-A', description: '12-digit numeric (US retail)' },
];

export function BarcodeConfigPanel({
  open,
  onOpenChange,
  onConfirm,
  availableFields = [],
  initialConfig,
  type,
}: BarcodeConfigPanelProps) {
  const [format, setFormat] = useState(initialConfig?.format || 'code128');
  const [dataSource, setDataSource] = useState<'static' | 'field'>(
    initialConfig?.dataSource || 'static'
  );
  const [staticValue, setStaticValue] = useState(
    initialConfig?.staticValue || getValidSampleValue('code128')
  );
  const [variableField, setVariableField] = useState(
    initialConfig?.variableField || (availableFields[0] || '')
  );
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Update preview when config changes
  useEffect(() => {
    const value = dataSource === 'static' ? staticValue : getValidSampleValue(format);
    
    if (type === 'qrcode') {
      setPreviewUrl(generateQRCodeDataUrl(value || 'https://example.com', { width: 150, height: 150 }));
      setValidationError(null);
    } else {
      const validation = validateBarcodeInput(value, format);
      if (!validation.valid) {
        setValidationError(validation.message || 'Invalid barcode value');
        setPreviewUrl('');
      } else {
        setValidationError(null);
        setPreviewUrl(generateBarcodeDataUrl(value, format, { height: 75, includetext: true }));
      }
    }
  }, [format, dataSource, staticValue, type]);

  // Update sample value when format changes
  useEffect(() => {
    if (dataSource === 'static' && type === 'barcode') {
      setStaticValue(getValidSampleValue(format));
    }
  }, [format, dataSource, type]);

  const handleConfirm = () => {
    onConfirm({
      type,
      format: type === 'qrcode' ? 'qrcode' : format,
      dataSource,
      staticValue: dataSource === 'static' ? staticValue : '',
      variableField: dataSource === 'field' ? variableField : '',
    });
    onOpenChange(false);
  };

  const canConfirm = dataSource === 'field' 
    ? !!variableField 
    : (type === 'qrcode' || !validationError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Configure {type === 'qrcode' ? 'QR Code' : 'Barcode'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Barcode Format Selection (only for barcodes) */}
          {type === 'barcode' && (
            <div className="space-y-2">
              <Label>Barcode Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {f.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Data Source Selection */}
          <div className="space-y-2">
            <Label>Data Source</Label>
            <RadioGroup
              value={dataSource}
              onValueChange={(v) => setDataSource(v as 'static' | 'field')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="static" id="static" />
                <Label htmlFor="static" className="font-normal cursor-pointer">
                  Static Value
                </Label>
              </div>
              {availableFields.length > 0 && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="field" id="field" />
                  <Label htmlFor="field" className="font-normal cursor-pointer">
                    Data Field (Variable)
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Static Value Input */}
          {dataSource === 'static' && (
            <div className="space-y-2">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder={type === 'qrcode' ? 'https://example.com' : 'Enter barcode value'}
              />
              {validationError && (
                <p className="text-sm text-destructive">{validationError}</p>
              )}
            </div>
          )}

          {/* Field Selection */}
          {dataSource === 'field' && availableFields.length > 0 && (
            <div className="space-y-2">
              <Label>Data Field</Label>
              <Select value={variableField} onValueChange={setVariableField}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The {type === 'qrcode' ? 'QR code' : 'barcode'} will be generated from this field for each record.
              </p>
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="flex items-center justify-center p-4 bg-muted rounded-md">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="max-h-24 object-contain"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BarcodeConfigPanel;