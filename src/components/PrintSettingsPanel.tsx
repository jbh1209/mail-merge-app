import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Printer, Scissors, Palette } from "lucide-react";
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
  
  // When enabling print marks, auto-switch to CMYK for professional print output
  const handlePrintMarksChange = (enabled: boolean) => {
    onChange({
      ...settings,
      enablePrintMarks: enabled,
      // Auto-enable CMYK when print marks are enabled (professional print workflow)
      colorMode: enabled ? 'cmyk' : settings.colorMode,
    });
  };
  
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
                  onCheckedChange={handlePrintMarksChange}
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
  
  // Dialog version with full options
  return (
    <div className="space-y-4 py-3 border-t">
      {/* Print Marks Toggle */}
      <div className="flex items-start space-x-3">
        <Switch
          id="print-marks"
          checked={settings.enablePrintMarks}
          onCheckedChange={handlePrintMarksChange}
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
      
      {/* Color Mode Selector */}
      <div className="flex items-start space-x-3 pl-[44px]">
        <div className="grid gap-1.5 leading-none flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium leading-none">
              <Palette className="h-4 w-4 inline mr-1.5 text-muted-foreground" />
              Color Mode
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[300px]">
                  <p className="text-xs">
                    <strong>RGB:</strong> For screen/digital viewing. Best for web, email, social media.<br/>
                    <strong>CMYK:</strong> For professional printing. Converts colors using {settings.region === 'US' ? 'GRACoL 2013' : 'FOGRA39'} ICC profile for accurate commercial print reproduction.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select 
            value={settings.colorMode} 
            onValueChange={(value: 'rgb' | 'cmyk') => onChange({ ...settings, colorMode: value })}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rgb" className="text-xs">
                RGB (Screen / Digital)
              </SelectItem>
              <SelectItem value="cmyk" className="text-xs">
                CMYK (Professional Print)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {settings.colorMode === 'cmyk' 
              ? `PDF/X-3 compliant with ${settings.region === 'US' ? 'GRACoL 2013' : 'FOGRA39'} profile`
              : 'Standard RGB output for digital distribution'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
