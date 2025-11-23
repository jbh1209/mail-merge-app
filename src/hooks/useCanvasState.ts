import { useState, useCallback } from 'react';
import { FieldConfig, autoLayoutFieldsSimple, constrainToBounds, snapToGrid } from '@/lib/canvas-utils';

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
    return autoLayoutFieldsSimple(initialFields, templateSize, 6, false);
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

  const getFieldData = useCallback(() => {
    return fields.map(f => ({
      field: f.templateField,
      sampleValue: sampleData?.[0]?.[f.templateField] || '',
      fieldType: f.fieldType,
      priority: 'MEDIUM'
    }));
  }, [fields, sampleData]);

  const autoLayout = useCallback(async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    
    try {
      const fieldNames = fields.map(f => f.templateField);
      
      const { data, error } = await supabase.functions.invoke('suggest-layout', {
        body: {
          templateSize,
          fieldNames,
          sampleData: sampleData || [],
          templateType: 'label'
        }
      });

      if (error) throw error;
      
      if (data?.fields) {
        console.log('📐 RAW AI RESPONSE:', {
          fields: data.fields.map((f: any) => ({
            name: f.templateField,
            pos: `${f.position.x},${f.position.y}`,
            size: `${f.size.width}×${f.size.height}`,
            fontSize: f.style.fontSize
          }))
        });
        
        const newFields = data.fields.map((field: any) => ({
          id: `field-${field.templateField}`,
          templateField: field.templateField,
          position: { x: field.position.x, y: field.position.y },
          size: { width: field.size.width, height: field.size.height },
          style: {
            fontSize: field.style.fontSize,
            fontFamily: field.style.fontFamily || 'Arial',
            fontWeight: field.style.fontWeight || 'normal',
            fontStyle: field.style.fontStyle || 'normal',
            textAlign: field.style.textAlign || 'left',
            color: field.style.color || '#000000',
            // Pass through all CSS rendering properties from AI
            whiteSpace: field.style.whiteSpace,
            wordWrap: field.style.wordWrap,
            lineHeight: field.style.lineHeight,
            display: field.style.display,
            transformCommas: field.style.transformCommas
          },
          showLabel: settings.showAllLabels,
          fieldType: 'text' as const
        }));
        
        console.log('🎨 APPLIED TO CANVAS:', {
          fields: newFields.map((f: any) => ({
            name: f.templateField,
            pos: `${f.position.x},${f.position.y}`,
            size: `${f.size.width}×${f.size.height}`,
            fontSize: f.style.fontSize
          }))
        });
        
        setFields(newFields);
        saveToHistory(newFields);
        
        return { 
          success: true, 
          strategy: data.layoutStrategy,
          layoutData: {
            fieldData: getFieldData(),
            layout: data.fields
          }
        };
      }
      
      throw new Error('Invalid AI response');
    } catch (error) {
      console.error('❌ AI LAYOUT FAILED:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        details: error
      });
      
      // Fallback to simple grid layout
      const fieldNames = fields.map(f => f.templateField);
      const fallbackFields = autoLayoutFieldsSimple(
        fieldNames,
        templateSize,
        6,
        settings.showAllLabels
      );
      
      console.log('📋 Using fallback layout:', {
        fieldCount: fallbackFields.length,
        fields: fallbackFields.map(f => ({ name: f.templateField, position: f.position }))
      });
      
      setFields(fallbackFields);
      saveToHistory(fallbackFields);
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        layoutData: {
          fieldData: getFieldData(),
          layout: null
        }
      };
    }
  }, [fields, templateSize, sampleData, settings.showAllLabels, saveToHistory, getFieldData]);

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
    finalizeFieldPositions,
    getFieldData
  };
};
