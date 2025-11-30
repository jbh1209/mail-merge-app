import { Hash, QrCode, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AddElementPanelProps {
  onAddSequence: () => void;
  onAddQRCode: () => void;
  onAddBarcode: () => void;
  onClose: () => void;
}

export function AddElementPanel({
  onAddSequence,
  onAddQRCode,
  onAddBarcode,
  onClose
}: AddElementPanelProps) {
  return (
    <Card className="absolute right-4 top-16 w-80 shadow-lg z-50 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Add Element</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Add special elements to your label design
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Sequential Number */}
        <button
          onClick={onAddSequence}
          className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors text-left group"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <Hash className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-0.5">Sequential Number</div>
            <div className="text-xs text-muted-foreground">
              Auto-incrementing numbers (e.g., INV-0001, INV-0002)
            </div>
          </div>
        </button>

        {/* QR Code */}
        <button
          onClick={onAddQRCode}
          className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors text-left group"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-0.5">QR Code</div>
            <div className="text-xs text-muted-foreground">
              Scannable QR codes from data or static text
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              Minimum recommended: 20×20mm
            </div>
          </div>
        </button>

        {/* Barcode */}
        <button
          onClick={onAddBarcode}
          className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors text-left group"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-0.5">Barcode</div>
            <div className="text-xs text-muted-foreground">
              CODE128, EAN-13, UPC-A, CODE39 formats
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              Minimum recommended: 30×21mm
            </div>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}
