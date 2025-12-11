import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRegionPreference } from "@/hooks/useRegionPreference";

interface CustomLabelSizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (size: {
    width_mm: number;
    height_mm: number;
    labelsPerSheet?: number;
    paperSize: string;
  }) => void;
  initialPartNumber?: string;
}

export function CustomLabelSizeDialog({ 
  open, 
  onOpenChange, 
  onSubmit,
  initialPartNumber 
}: CustomLabelSizeDialogProps) {
  const { isUS } = useRegionPreference();
  const [unit, setUnit] = useState<"mm" | "inches">(isUS ? "inches" : "mm");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [labelsPerSheet, setLabelsPerSheet] = useState("");
  const [paperSize, setPaperSize] = useState(isUS ? "US Letter" : "A4");

  const handleSubmit = () => {
    const widthNum = parseFloat(width);
    const heightNum = parseFloat(height);
    
    if (isNaN(widthNum) || isNaN(heightNum) || widthNum <= 0 || heightNum <= 0) {
      return;
    }

    const width_mm = unit === "inches" ? widthNum * 25.4 : widthNum;
    const height_mm = unit === "inches" ? heightNum * 25.4 : heightNum;

    onSubmit({
      width_mm,
      height_mm,
      labelsPerSheet: labelsPerSheet ? parseInt(labelsPerSheet) : undefined,
      paperSize,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Custom Label Size</DialogTitle>
          {initialPartNumber && (
            <p className="text-sm text-muted-foreground">
              You can find the dimensions for {initialPartNumber} on the packaging or at{" "}
              <a 
                href={`https://www.avery.com/templates/${initialPartNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Avery.com
              </a>
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as "mm" | "inches")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inches">Inches</SelectItem>
                  <SelectItem value="mm">Millimeters</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label>Paper Size</Label>
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US Letter">US Letter</SelectItem>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="A5">A5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label>Label Width ({unit})</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={unit === "inches" ? "2.63" : "66.7"}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label>Label Height ({unit})</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={unit === "inches" ? "1.00" : "25.4"}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Labels per Sheet (optional)</Label>
            <Input
              type="number"
              min="1"
              placeholder="30"
              value={labelsPerSheet}
              onChange={(e) => setLabelsPerSheet(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!width || !height}>
            Use This Size
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
