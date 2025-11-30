import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldConfig } from '@/lib/canvas-utils';

interface SequenceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: Partial<FieldConfig>) => void;
  templateSize: { width: number; height: number };
}

export function SequenceConfigDialog({
  open,
  onOpenChange,
  onConfirm,
  templateSize
}: SequenceConfigDialogProps) {
  const [startNumber, setStartNumber] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [padding, setPadding] = useState(4);

  const handleConfirm = () => {
    const fieldConfig: Partial<FieldConfig> = {
      id: `field-${crypto.randomUUID()}`,
      templateField: 'SEQUENCE',
      position: { 
        x: Math.max(5, (templateSize.width - 30) / 2), 
        y: Math.max(5, (templateSize.height - 10) / 2)
      },
      size: { width: 30, height: 10 },
      style: {
        fontSize: 12,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#000000',
        verticalAlign: 'middle'
      },
      fieldType: 'sequence',
      typeConfig: {
        sequenceStart: startNumber,
        sequencePrefix: prefix,
        sequenceSuffix: suffix,
        sequencePadding: padding
      },
      showLabel: false,
      overflow: 'shrink',
      autoFit: false
    };

    onConfirm(fieldConfig);
    onOpenChange(false);
    
    // Reset form
    setStartNumber(1);
    setPrefix('');
    setSuffix('');
    setPadding(4);
  };

  const getPreview = () => {
    const number = startNumber.toString().padStart(padding, '0');
    return `${prefix}${number}${suffix}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sequential Number</DialogTitle>
          <DialogDescription>
            Configure auto-incrementing numbers for your labels
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="start">Start Number</Label>
            <Input
              id="start"
              type="number"
              value={startNumber}
              onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
              min={0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prefix">Prefix (Optional)</Label>
            <Input
              id="prefix"
              placeholder="e.g., INV-"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              maxLength={10}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="suffix">Suffix (Optional)</Label>
            <Input
              id="suffix"
              placeholder="e.g., -2024"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              maxLength={10}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="padding">Number Padding</Label>
            <Input
              id="padding"
              type="number"
              value={padding}
              onChange={(e) => setPadding(Math.max(1, Math.min(8, parseInt(e.target.value) || 4)))}
              min={1}
              max={8}
            />
            <p className="text-xs text-muted-foreground">
              Number of digits (e.g., 4 = 0001, 0002, etc.)
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Preview:</div>
            <div className="font-mono text-lg font-medium">{getPreview()}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Add to Canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
