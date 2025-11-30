import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FieldConfig } from '@/lib/canvas-utils';

interface QRCodeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: Partial<FieldConfig>) => void;
  templateSize: { width: number; height: number };
  availableFields?: string[];
}

export function QRCodeConfigDialog({
  open,
  onOpenChange,
  onConfirm,
  templateSize,
  availableFields = []
}: QRCodeConfigDialogProps) {
  const [dataSource, setDataSource] = useState<'static' | 'field'>('static');
  const [staticText, setStaticText] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [errorCorrection, setErrorCorrection] = useState<'L' | 'M' | 'Q' | 'H'>('M');

  const handleConfirm = () => {
    const dataValue = dataSource === 'static' ? staticText : selectedField;
    
    if (!dataValue) {
      return;
    }

    const fieldConfig: Partial<FieldConfig> = {
      id: `field-${crypto.randomUUID()}`,
      templateField: dataSource === 'static' ? `QR_${staticText.slice(0, 10)}` : selectedField,
      position: { 
        x: Math.max(5, (templateSize.width - 25) / 2), 
        y: Math.max(5, (templateSize.height - 25) / 2)
      },
      size: { width: 25, height: 25 },
      style: {
        fontSize: 12,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#000000',
        verticalAlign: 'middle'
      },
      fieldType: 'qrcode',
      typeConfig: {
        qrErrorCorrection: errorCorrection,
        ...(dataSource === 'static' && { staticValue: staticText })
      },
      showLabel: false,
      overflow: 'shrink',
      autoFit: false
    };

    onConfirm(fieldConfig);
    onOpenChange(false);
    
    // Reset form
    setStaticText('');
    setSelectedField('');
    setErrorCorrection('M');
  };

  const canConfirm = dataSource === 'static' ? staticText.trim().length > 0 : selectedField.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add QR Code</DialogTitle>
          <DialogDescription>
            Configure QR code data source and settings
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <Label>Data Source</Label>
            <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as 'static' | 'field')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="static" id="static" />
                <Label htmlFor="static" className="font-normal cursor-pointer">
                  Static Text
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="field" id="field" />
                <Label htmlFor="field" className="font-normal cursor-pointer">
                  From Data Field
                </Label>
              </div>
            </RadioGroup>
          </div>

          {dataSource === 'static' ? (
            <div className="space-y-2">
              <Label htmlFor="staticText">QR Code Content</Label>
              <Input
                id="staticText"
                placeholder="Enter URL, text, or data"
                value={staticText}
                onChange={(e) => setStaticText(e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Same content on all labels
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="field">Select Data Field</Label>
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger id="field">
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
                Different QR code per label based on data
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="errorCorrection">Error Correction Level</Label>
            <Select value={errorCorrection} onValueChange={(v) => setErrorCorrection(v as any)}>
              <SelectTrigger id="errorCorrection">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L">Low (7% recovery)</SelectItem>
                <SelectItem value="M">Medium (15% recovery)</SelectItem>
                <SelectItem value="Q">Quartile (25% recovery)</SelectItem>
                <SelectItem value="H">High (30% recovery)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Higher levels allow QR code to be read even if partially damaged
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Minimum Size:</strong> 20×20mm recommended for reliable scanning
            </div>
          </div>
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
