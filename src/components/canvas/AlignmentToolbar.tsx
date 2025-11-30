import { AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AlignmentToolbarProps {
  selectedCount: number;
  onAlign: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute: (direction: 'horizontal' | 'vertical') => void;
}

export function AlignmentToolbar({ selectedCount, onAlign, onDistribute }: AlignmentToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Separator orientation="vertical" className="h-5" />
        
        {/* Horizontal alignment */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('left')}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Left</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('center')}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Center</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('right')}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Right</TooltipContent>
          </Tooltip>
        </div>
        
        <Separator orientation="vertical" className="h-5" />
        
        {/* Vertical alignment */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('top')}
              >
                <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Top</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('middle')}
              >
                <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Middle</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('bottom')}
              >
                <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Bottom</TooltipContent>
          </Tooltip>
        </div>
        
        {/* Distribution - only show for 3+ items */}
        {selectedCount >= 3 && (
          <>
            <Separator orientation="vertical" className="h-5" />
            
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onDistribute('horizontal')}
                  >
                    <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Distribute Horizontally</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onDistribute('vertical')}
                  >
                    <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Distribute Vertically</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
