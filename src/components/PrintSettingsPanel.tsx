import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Printer, Scissors } from "lucide-react";
import { PrintSettings, formatBleedDimension } from "@/types/print-settings";
import { cn } from "@/lib/utils";

interface PrintSettingsPanelProps {
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
  /** Compact mode for toolbar placement (default: false for dialog) */
  compact?: boolean;
}

export function PrintSettingsPanel({ settings, onChange, compact = false }: PrintSettingsPanelProps) {
  const bleedDisplay = formatBleedDimension(settings.bleedMm, settings.region === 'US');
  
  if (compact) {
    // Compact toolbar version with switch
    return (
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border">
                <Scissors className={cn(
                  "h-4 w-4 transition-colors",
                  settings.enablePrintMarks ? "text-primary" : "text-muted-foreground"
                )} />
                <Label 
                  htmlFor="bleed-toggle" 
                  className="text-xs font-medium cursor-pointer select-none whitespace-nowrap"
                >
                  Bleed
                </Label>
                <Switch
                  id="bleed-toggle"
                  checked={settings.enablePrintMarks}
                  onCheckedChange={(checked) =>
                    onChange({ ...settings, enablePrintMarks: checked })
                  }
                  className="scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px]">
              <p className="text-xs">
                {settings.enablePrintMarks 
                  ? `Bleed zone visible (${bleedDisplay}). Extend backgrounds to the edge, keep text inside the trim line.`
                  : `Enable to show ${bleedDisplay} bleed zone for professional printing.`
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }
  
  // Dialog version (original checkbox style)
  return (
    <div className="flex items-start space-x-3 py-3 border-t">
      <Switch
        id="print-marks"
        checked={settings.enablePrintMarks}
        onCheckedChange={(checked) =>
          onChange({ ...settings, enablePrintMarks: !!checked })
        }
      />
      <div className="grid gap-1.5 leading-none">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="print-marks"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            <Printer className="h-4 w-4 inline mr-1.5 text-muted-foreground" />
            Professional print output
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[280px]">
                <p className="text-xs">
                  Adds {bleedDisplay} bleed area and crop marks for commercial
                  printing. Print shops use crop marks to cut pages accurately.
                  The TrimBox is set for imposition software compatibility.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground">
          Include {bleedDisplay} bleed + crop marks
        </p>
      </div>
    </div>
  );
}
