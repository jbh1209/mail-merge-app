import { useState, useCallback } from 'react';
import { FieldConfig, autoLayoutFields, constrainToBounds, snapToGrid } from '@/lib/canvas-utils';

interface Size {
  width: number;
  height: number;
}

export interface CanvasSettings {
  scale: number;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number; // mm
  backgroundColor: string;
  showAllLabels: boolean;
  defaultLabelFontSize: number; // pt
}

interface UseCanvasStateProps {
  templateSize: Size;
  initialFields: string[];
  initialDesignConfig?: any;
  sampleData?: any[];
}

export const useCanvasState = ({ 
  templateSize, 
  initialFields, 
  initialDesignConfig,
  sampleData = []
}: UseCanvasStateProps) => {
  // Initialize fields from existing design or create new
  const [fields, setFields] = useState<FieldConfig[]>(() => {
    if (initialDesignConfig?.fields) {
      return initialDesignConfig.fields;
    }
    return autoLayoutFields(initialFields, templateSize, sampleData);
  });
  
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  
  // Calculate smart default scale based on template size
  const calculateDefaultScale = () => {
    if (templateSize.width <= 100) return 2.5;
    if (templateSize.width <= 150) return 2;
    return 1.5;
  };

  // Initialize settings from existing design or create new
  const [settings, setSettings] = useState<CanvasSettings>(() => {
    if (initialDesignConfig?.canvasSettings) {
      return initialDesignConfig.canvasSettings;
    }
    return {
      scale: calculateDefaultScale(),
      showGrid: true,
      snapToGrid: true,
      gridSize: 1,
      backgroundColor: '#ffffff',
      showAllLabels: false,
      defaultLabelFontSize: 6
    };
  });
  const [history, setHistory] = useState<FieldConfig[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveToHistory = useCallback((newFields: FieldConfig[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newFields)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const updateField = useCallback((fieldId: string, updates: Partial<FieldConfig>) => {
    setFields(prev => {
      const newFields = prev.map(f => 
        f.id === fieldId ? { ...f, ...updates } : f
      );
      saveToHistory(newFields);
      return newFields;
    });
  }, [saveToHistory]);

  const moveField = useCallback((fieldId: string, newPosition: { x: number; y: number }) => {
    setFields(prev => {
      const field = prev.find(f => f.id === fieldId);
      if (!field) return prev;

      let position = newPosition;
      
      // Snap to grid if enabled
      if (settings.snapToGrid) {
        position = {
          x: snapToGrid(position.x, settings.gridSize, settings.scale),
          y: snapToGrid(position.y, settings.gridSize, settings.scale)
        };
      }

      // Constrain to bounds
      position = constrainToBounds(position, field.size, templateSize);

      const newFields = prev.map(f => 
        f.id === fieldId ? { ...f, position } : f
      );
      return newFields;
    });
  }, [settings, templateSize]);

  const resizeField = useCallback((fieldId: string, newSize: { width: number; height: number }) => {
    setFields(prev => {
      const newFields = prev.map(f => {
        if (f.id === fieldId) {
          // Constrain size
          const size = {
            width: Math.max(10, Math.min(newSize.width, templateSize.width - f.position.x)),
            height: Math.max(5, Math.min(newSize.height, templateSize.height - f.position.y))
          };
          return { ...f, size };
        }
        return f;
      });
      return newFields;
    });
  }, [templateSize]);

  const updateFieldStyle = useCallback((fieldId: string, styleUpdates: Partial<FieldConfig['style']>) => {
    updateField(fieldId, {
      style: {
        ...fields.find(f => f.id === fieldId)?.style!,
        ...styleUpdates
      }
    });
  }, [fields, updateField]);

  const deleteField = useCallback((fieldId: string) => {
    setFields(prev => {
      const newFields = prev.filter(f => f.id !== fieldId);
      saveToHistory(newFields);
      return newFields;
    });
    // Clear selection if deleted field was selected
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  }, [saveToHistory, selectedFieldId]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setFields(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setFields(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const toggleFieldLabels = useCallback((fieldId?: string) => {
    setFields(prev => {
      const newFields = prev.map(f => {
        if (fieldId) {
          // Toggle specific field
          return f.id === fieldId ? { ...f, showLabel: !f.showLabel } : f;
        } else {
          // Toggle all fields
          return { ...f, showLabel: !f.showLabel };
        }
      });
      saveToHistory(newFields);
      return newFields;
    });
  }, [saveToHistory]);

  const updateFieldType = useCallback((fieldId: string, fieldType: FieldConfig['fieldType'], typeConfig?: any) => {
    updateField(fieldId, { fieldType, typeConfig });
  }, [updateField]);

  const autoLayout = useCallback(() => {
    const newFields = autoLayoutFields(
      fields.map(f => f.templateField),
      templateSize,
      sampleData,
      5, // padding
      settings.showAllLabels
    );
    setFields(newFields);
    saveToHistory(newFields);
  }, [fields, templateSize, sampleData, settings.showAllLabels, saveToHistory]);

  const updateSettings = useCallback((newSettings: Partial<CanvasSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const toggleAllFieldLabels = useCallback((showLabels: boolean) => {
    setFields(prev => {
      const newFields = prev.map(f => ({
        ...f,
        showLabel: showLabels
      }));
      saveToHistory(newFields);
      return newFields;
    });
    
    // Also update the canvas setting for visual consistency
    updateSettings({ showAllLabels: showLabels });
  }, [saveToHistory, updateSettings]);

  const finalizeFieldPositions = useCallback(() => {
    // Use callback to get the LATEST fields state
    setFields(currentFields => {
      console.log('💾 FINALIZING FIELD POSITIONS:', currentFields.map(f => ({
        name: f.templateField,
        position: f.position,
        size: f.size,
        fontSize: f.style.fontSize
      })));
      saveToHistory(currentFields);
      return currentFields; // Return same state but save to history
    });
  }, [saveToHistory]);

  return {
    fields,
    selectedFieldId,
    settings,
    setSelectedFieldId,
    moveField,
    resizeField,
    updateFieldStyle,
    toggleFieldLabels,
    toggleAllFieldLabels,
    updateFieldType,
    updateSettings,
    autoLayout,
    deleteField,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    finalizeFieldPositions
  };
};
