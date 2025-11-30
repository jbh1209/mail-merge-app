import { useEffect, useState } from 'react';
import { Trash2, Lock, Unlock, Eye, EyeOff, ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  fieldId: string;
  isLocked: boolean;
  isVisible: boolean;
  onDelete: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onClose: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  fieldId,
  isLocked,
  isVisible,
  onDelete,
  onToggleLock,
  onToggleVisibility,
  onBringToFront,
  onSendToBack,
  onClose
}: CanvasContextMenuProps) {
  useEffect(() => {
    const handleClickOutside = () => onClose();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div 
      className="fixed z-50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <Card className="p-1 shadow-lg border min-w-[160px]">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-8 px-2 text-xs"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete
        </Button>
        
        <Separator className="my-1" />
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-8 px-2 text-xs"
          onClick={() => {
            onToggleLock();
            onClose();
          }}
        >
          {isLocked ? (
            <>
              <Unlock className="h-3.5 w-3.5 mr-2" />
              Unlock
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5 mr-2" />
              Lock
            </>
          )}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-8 px-2 text-xs"
          onClick={() => {
            onToggleVisibility();
            onClose();
          }}
        >
          {isVisible ? (
            <>
              <EyeOff className="h-3.5 w-3.5 mr-2" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 mr-2" />
              Show
            </>
          )}
        </Button>
        
        <Separator className="my-1" />
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-8 px-2 text-xs"
          onClick={() => {
            onBringToFront();
            onClose();
          }}
        >
          <ArrowUpToLine className="h-3.5 w-3.5 mr-2" />
          Bring to Front
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-8 px-2 text-xs"
          onClick={() => {
            onSendToBack();
            onClose();
          }}
        >
          <ArrowDownToLine className="h-3.5 w-3.5 mr-2" />
          Send to Back
        </Button>
      </Card>
    </div>
  );
}
