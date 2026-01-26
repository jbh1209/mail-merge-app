/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SequencePanelProps {
  store: any;
  /** Called immediately after inserting a sequence to commit to base template */
  onInserted?: () => void;
}

export function SequencePanel({ store, onInserted }: SequencePanelProps) {
  const [startNumber, setStartNumber] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [padding, setPadding] = useState(4);

  const formatSequencePreview = () => {
    const paddedNumber = String(startNumber).padStart(padding, '0');
    return `${prefix}${paddedNumber}${suffix}`;
  };

  const handleInsertSequence = () => {
    const page = store.activePage;
    if (!page) return;

    page.addElement({
      type: 'text',
      x: page.width / 2 - 60,
      y: page.height / 2 - 15,
      width: 120,
      height: 30,
      text: formatSequencePreview(),
      fontSize: 18,
      fontFamily: 'Roboto Mono',
      align: 'center',
      custom: {
        sequenceConfig: {
          startNumber,
          prefix,
          suffix,
          padding,
        },
      },
    });
    
    // CRITICAL: Immediately commit to base template to prevent loss on record navigation
    // Small delay to ensure Polotno has processed the addElement
    setTimeout(() => {
      onInserted?.();
    }, 50);
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Sequence Numbers</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Auto-incrementing numbers for each record.
      </p>
      
      <ScrollArea className="h-[calc(100vh-350px)]">
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Start Number</Label>
            <Input
              type="number"
              value={startNumber}
              onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
              min={0}
              className="h-8 text-xs mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Prefix (optional)</Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. INV-"
              className="h-8 text-xs mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Suffix (optional)</Label>
            <Input
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder="e.g. -2024"
              className="h-8 text-xs mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Zero Padding</Label>
            <Input
              type="number"
              value={padding}
              onChange={(e) => setPadding(parseInt(e.target.value) || 0)}
              min={0}
              max={10}
              className="h-8 text-xs mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Number of digits (e.g., 4 = 0001)
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Preview</p>
            <p className="font-mono text-lg">{formatSequencePreview()}</p>
          </div>

          <Button onClick={handleInsertSequence} className="w-full">
            <Hash className="h-4 w-4 mr-1" />
            Insert Sequence
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
