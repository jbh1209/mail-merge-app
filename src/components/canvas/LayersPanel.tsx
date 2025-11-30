import { useState } from 'react';
import { FieldConfig } from '@/lib/canvas-utils';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Type, QrCode, Barcode, Hash, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LayersPanelProps {
  fields: FieldConfig[];
  selectedFieldIds: string[];
  onReorder: (fieldId: string, newIndex: number) => void;
  onToggleLock: (fieldId: string) => void;
  onToggleVisibility: (fieldId: string) => void;
  onSelect: (fieldId: string, addToSelection: boolean) => void;
}

const getFieldIcon = (fieldType: FieldConfig['fieldType']) => {
  switch (fieldType) {
    case 'barcode': return Barcode;
    case 'qrcode': return QrCode;
    case 'sequence': return Hash;
    case 'address_block': return MapPin;
    default: return Type;
  }
};

export function LayersPanel({
  fields,
  selectedFieldIds,
  onReorder,
  onToggleLock,
  onToggleVisibility,
  onSelect
}: LayersPanelProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Sort by zIndex (higher = on top = earlier in list)
  const sortedFields = [...fields].sort((a, b) => 
    (b.zIndex || 0) - (a.zIndex || 0)
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    // Visual feedback could be added here
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const draggedField = sortedFields[draggedIndex];
    onReorder(draggedField.id, dropIndex);
    setDraggedIndex(null);
  };

  return (
    <div className="w-64 border-l bg-background flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">Layers</h3>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedFields.map((field, index) => {
            const Icon = getFieldIcon(field.fieldType);
            const isSelected = selectedFieldIds.includes(field.id);
            const isVisible = field.visible !== false;
            const isLocked = field.locked || false;
            
            return (
              <div
                key={field.id}
                draggable={!isLocked}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onClick={(e) => onSelect(field.id, e.shiftKey)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                  "hover:bg-muted/50",
                  isSelected && "bg-primary/10 border border-primary/20",
                  !isVisible && "opacity-40"
                )}
              >
                {!isLocked && (
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                )}
                {isLocked && (
                  <div className="w-4" />
                )}
                
                <Icon className="h-4 w-4 text-muted-foreground" />
                
                <span className="flex-1 text-sm truncate">
                  {field.templateField}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(field.id);
                  }}
                >
                  {isVisible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock(field.id);
                  }}
                >
                  {isLocked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
