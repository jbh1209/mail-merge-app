import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Printer } from "lucide-react";
import { PrintSettings, formatBleedDimension } from "@/types/print-settings";

interface PrintSettingsPanelProps {
  settings: PrintSettings;
  onChange: (settings: PrintSettings) => void;
}

export function PrintSettingsPanel({ settings, onChange }: PrintSettingsPanelProps) {
  const bleedDisplay = formatBleedDimension(settings.bleedMm, settings.region === 'US');
  
  return (
    <div className="flex items-start space-x-3 py-3 border-t">
      <Checkbox
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
