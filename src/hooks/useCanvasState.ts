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
  shouldShowLabels?: boolean;
}

export const useCanvasState = ({ 
  templateSize, 
  initialFields, 
  initialDesignConfig,
  sampleData = [],
  shouldShowLabels = false
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
      showAllLabels: shouldShowLabels,
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
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    // If user explicitly changes font size, disable auto-fit
    const shouldDisableAutoFit = 'fontSize' in styleUpdates;
    
    updateField(fieldId, {
      style: { ...field.style, ...styleUpdates },
      ...(shouldDisableAutoFit && { 
        autoFit: false, 
        autoFitApplied: false  // Mark as user-controlled
      })
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
    const field = fields.find(f => f.id === fieldId);
    
    // Protect address blocks - don't change their type
    if (field?.fieldType === 'address_block' && fieldType !== 'address_block') {
      console.warn('Cannot change address_block type - skipping');
      return;
    }
    
    // Preserve combinedFields when updating
    const updates: any = { fieldType, typeConfig };
    if (field?.combinedFields) {
      updates.combinedFields = field.combinedFields;
    }
    
    updateField(fieldId, updates);
  }, [fields, updateField]);

  const getFieldData = useCallback(() => {
    return fields.map(f => {
      const sampleValue = sampleData?.[0]?.[f.templateField] || '';
      const fieldName = f.templateField.toUpperCase();
      
      // Intelligent priority detection based on field semantics
      let priority = 'MEDIUM';
      if (fieldName.includes('ADDRESS') || fieldName.includes('LOCATION')) {
        priority = 'HIGHEST'; // Multi-line fields need 50-60% vertical space
      } else if ((fieldName.includes('NAME') || fieldName.includes('STORE')) && !fieldName.includes('CODE')) {
        priority = 'HIGH'; // Names need visual prominence
      } else if (sampleValue.length <= 10 || fieldName.includes('CODE') || fieldName.includes('ID') || fieldName.includes('SKU')) {
        priority = 'LOW'; // Short codes/IDs are compact
      }
      
      // Calculate additional metadata
      const maxCharacters = sampleValue.length;
      const lineCount = fieldName.includes('ADDRESS') 
        ? (sampleValue.match(/,/g) || []).length + 1 
        : undefined;
      
      return {
        field: f.templateField,
        sampleValue,
        fieldType: f.fieldType,
        priority,
        maxCharacters,
        lineCount
      };
    });
  }, [fields, sampleData]);

  const autoLayout = useCallback(async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    
    try {
      const fieldNames = fields.map(f => f.templateField);
      
      // Phase 1: Try hybrid layout system first
      const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
        body: {
          fieldNames,
          sampleData: sampleData.slice(0, 5) || [],
          templateSize,
          templateType: 'built_in_library',
          labelAnalysis: null // Will be passed from TemplateDesignCanvas later
        }
      });

      if (!hybridError && hybridData?.designStrategy) {
        console.log('🎨 Hybrid layout: AI strategy received');
        
        // Phase 2: Execute with rules engine
        const { executeLayout, DEFAULT_LAYOUT_CONFIG } = await import('@/lib/layout-engine');
        
        const config = {
          ...DEFAULT_LAYOUT_CONFIG,
          templateSize
        };

        const result = executeLayout(
          hybridData.designStrategy,
          config,
          sampleData[0] || {}
        );

        console.log('✓ Rules engine executed:', result);
        
        // Convert rules engine output to canvas field format
        const newFields = result.fields.map(field => ({
          id: `field-${field.templateField}`,
          templateField: field.templateField,
          position: { x: field.x, y: field.y },
          size: { width: field.width, height: field.height },
          style: {
            fontSize: field.fontSize,
            fontFamily: 'Arial',
            fontWeight: field.fontWeight,
            fontStyle: 'normal' as const,
            textAlign: field.textAlign,
            color: '#000000',
            verticalAlign: field.verticalAlign,
            ...(field.whiteSpace && { whiteSpace: field.whiteSpace }),
            ...(field.transformCommas && { transformCommas: field.transformCommas })
          },
          showLabel: settings.showAllLabels,
          fieldType: (field.fieldType as any) || 'text' as const,
          overflow: 'wrap' as const,
          autoFit: true, // Allow auto-fit on first render
          autoFitApplied: false, // Explicitly mark as not yet applied
          ...(field.combinedFields && { combinedFields: field.combinedFields })
        }));
        
        setFields(newFields);
        saveToHistory(newFields);
        
        return { 
          success: true, 
          strategy: 'hybrid_ai_rules',
          layoutData: {
            fieldData: getFieldData(),
            layout: result.fields,
            designStrategy: hybridData.designStrategy
          }
        };
      }
      
      // Fallback to old AI system if hybrid fails
      console.log('Hybrid system unavailable, using fallback AI...');
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
            whiteSpace: field.style.whiteSpace,
            wordWrap: field.style.wordWrap,
            lineHeight: field.style.lineHeight,
            display: field.style.display,
            transformCommas: field.style.transformCommas
          },
          showLabel: settings.showAllLabels,
          fieldType: 'text' as const,
          autoFit: true // Allow auto-fit on first render
        }));
        
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
      console.error('❌ LAYOUT GENERATION FAILED:', error);
      
      // Fallback to simple grid layout
      const fieldNames = fields.map(f => f.templateField);
      const fallbackFields = autoLayoutFieldsSimple(
        fieldNames,
        templateSize,
        6,
        settings.showAllLabels
      );
      
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
