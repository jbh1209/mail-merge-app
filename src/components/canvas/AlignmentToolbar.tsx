import { AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AlignmentToolbarProps {
  selectedCount: number;
  onAlign: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute: (direction: 'horizontal' | 'vertical') => void;
}

export function AlignmentToolbar({ selectedCount, onAlign, onDistribute }: AlignmentToolbarProps) {
  const isDisabled = selectedCount === 0;
  const canDistribute = selectedCount >= 3;

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
                disabled={isDisabled}
              >
                <AlignStartHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Elements to Left</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('center')}
                disabled={isDisabled}
              >
                <AlignCenterHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Center Elements Horizontally</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('right')}
                disabled={isDisabled}
              >
                <AlignEndHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Elements to Right</TooltipContent>
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
                disabled={isDisabled}
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Elements to Top</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('middle')}
                disabled={isDisabled}
              >
                <AlignCenterVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Center Elements Vertically</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onAlign('bottom')}
                disabled={isDisabled}
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Align Elements to Bottom</TooltipContent>
          </Tooltip>
        </div>
        
        {/* Distribution - always show buttons but disable when < 3 items */}
        <Separator orientation="vertical" className="h-5" />
        
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onDistribute('horizontal')}
                disabled={!canDistribute}
              >
                <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Distribute Horizontally (3+ items)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onDistribute('vertical')}
                disabled={!canDistribute}
              >
                <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Distribute Vertically (3+ items)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
