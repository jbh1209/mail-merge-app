import { useRef, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FabricLabelCanvas } from './canvas/FabricLabelCanvas';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { useCanvasState } from '@/hooks/useCanvasState';
import { mmToPx } from '@/lib/canvas-utils';
import { CheckCircle2, Info, ChevronLeft, ChevronRight, Bug } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { DiagnosticModal } from './DiagnosticModal';
import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';

interface TemplateDesignCanvasProps {
  templateSize: { width: number; height: number };
  templateName: string;
  fieldNames: string[];
  sampleData?: Record<string, any>[];
  initialDesignConfig?: any;
  onSave: (designConfig: any) => void;
  onCancel: () => void;
  stepInfo?: { current: number; total: number };
  templateId?: string;
  dataSourceId?: string;
  projectId?: string;
}

export function TemplateDesignCanvas({
  templateSize,
  templateName,
  fieldNames,
  sampleData,
  initialDesignConfig,
  onSave,
  onCancel,
  stepInfo,
  templateId,
  dataSourceId,
  projectId
}: TemplateDesignCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const [currentDataIndex, setCurrentDataIndex] = useState(0);
  const [isAutoLayoutLoading, setIsAutoLayoutLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [isDiagnosticLoading, setIsDiagnosticLoading] = useState(false);
  const [lastLayoutData, setLastLayoutData] = useState<any>(null);
  const [labelAnalysis, setLabelAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const currentSample = sampleData?.[currentDataIndex];

  // Analyze label complexity on mount
  useEffect(() => {
    const analyzeComplexity = async () => {
      if (!fieldNames?.length || isAnalyzing || labelAnalysis) return;
      
      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase.functions.invoke('analyze-label-complexity', {
          body: {
            fieldNames,
            sampleData: currentSample,
            templateType: 'custom'
          }
        });

        if (error) throw error;
        
        console.log('📊 Label analysis:', data);
        setLabelAnalysis(data);
      } catch (error) {
        console.error('Failed to analyze complexity:', error);
        // Fallback: simple heuristic
        setLabelAnalysis({
          complexityScore: 50,
          shouldShowLabels: fieldNames.length >= 5,
          reasoning: 'Fallback analysis'
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeComplexity();
  }, [fieldNames, currentSample, isAnalyzing, labelAnalysis]);

  const {
    fields,
    selectedFieldId,
    settings,
    setSelectedFieldId,
    moveField,
    resizeField,
    updateFieldStyle,
    updateSettings,
    autoLayout: autoLayoutFn,
    deleteField,
    toggleFieldLabels,
    toggleAllFieldLabels,
    updateFieldType,
    undo,
    redo,
    canUndo,
    canRedo,
    finalizeFieldPositions,
    getFieldData
  } = useCanvasState({ 
    templateSize, 
    initialFields: fieldNames,
    initialDesignConfig,
    sampleData,
    shouldShowLabels: labelAnalysis?.shouldShowLabels ?? false
  });

  const captureCanvasAsBase64 = async (): Promise<string> => {
    if (!canvasRef.current) throw new Error('Canvas ref not available');
    
    const canvas = await html2canvas(canvasRef.current, {
      backgroundColor: settings.backgroundColor,
      scale: 2,
      logging: false
    });
    
    return canvas.toDataURL('image/png');
  };

  const runDiagnostic = async () => {
    if (!lastLayoutData) {
      toast({
        title: "No Layout Data",
        description: "Generate a layout first before running diagnostics.",
        variant: "destructive"
      });
      return;
    }

    setIsDiagnosticLoading(true);
    setIsDiagnosticOpen(true);

    try {
      const failedLayoutImage = await captureCanvasAsBase64();

      const { data, error } = await supabase.functions.invoke('diagnose-layout', {
        body: {
          failedLayoutImage,
          fieldData: lastLayoutData.fieldData,
          failedLayout: lastLayoutData.layout,
          templateSize
        }
      });

      if (error) throw error;

      console.log('🔍 DIAGNOSTIC RESULT:', data);
      setDiagnosticResult(data.diagnostic);
      
      toast({
        title: "Diagnostic Complete",
        description: "AI has analyzed the layout and provided recommendations.",
      });
    } catch (error) {
      console.error('❌ DIAGNOSTIC ERROR:', error);
      toast({
        title: "Diagnostic Failed",
        description: error instanceof Error ? error.message : "Failed to analyze layout",
        variant: "destructive"
      });
    } finally {
      setIsDiagnosticLoading(false);
    }
  };

  const handleAutoLayout = async () => {
    console.log('🎨 AUTO-LAYOUT TRIGGERED:', {
      templateSize,
      fieldCount: fields.length,
      sampleDataAvailable: !!sampleData,
      sampleRowCount: sampleData?.length || 0
    });
    
    setIsAutoLayoutLoading(true);
    const result = await autoLayoutFn();
    setIsAutoLayoutLoading(false);
    
    // Store layout data for diagnostic
    if (result.success && result.layoutData) {
      setLastLayoutData(result.layoutData);
    }
    
    console.log('📊 LAYOUT RESULT:', {
      success: result.success,
      strategy: result.strategy,
      error: result.error,
      newFieldCount: fields.length
    });
    
    if (result.success) {
      toast({
        title: result.strategy === 'hybrid_ai_rules' ? "Hybrid Layout Complete" : "Layout Optimized",
        description: result.strategy === 'hybrid_ai_rules' 
          ? "AI designed strategy + rules engine executed precisely."
          : "Field positions and sizes have been optimized successfully.",
      });
    } else {
      toast({
        title: "Layout Generation Failed",
        description: `${result.error}. Using fallback layout.`,
        variant: "destructive"
      });
      
      // Auto-run diagnostic on failure if we have layout data
      if (result.layoutData) {
        setLastLayoutData(result.layoutData);
        setTimeout(() => runDiagnostic(), 1000);
      }
    }
  };

  // Auto-trigger AI layout on mount if we have sample data
  useEffect(() => {
    if (sampleData && sampleData.length > 0 && !initialDesignConfig?.fields) {
      console.log('🎨 AUTO-TRIGGERING AI LAYOUT ON MOUNT');
      handleAutoLayout();
    }
  }, []); // Empty deps = only run once on mount

  const selectedField = fields.find(f => f.id === selectedFieldId) || null;
  const sampleRow = sampleData?.[currentDataIndex];

  // Keyboard navigation for sample data
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sampleData || sampleData.length <= 1) return;
      
      if (e.key === 'ArrowLeft' && currentDataIndex > 0) {
        setCurrentDataIndex(currentDataIndex - 1);
      } else if (e.key === 'ArrowRight' && currentDataIndex < sampleData.length - 1) {
        setCurrentDataIndex(currentDataIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDataIndex, sampleData]);

  const handleSave = () => {
    finalizeFieldPositions();
    const designConfig = {
      fields,
      canvasSettings: {
        backgroundColor: settings.backgroundColor,
        showGrid: settings.showGrid,
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize,
        showAllLabels: settings.showAllLabels,
        defaultLabelFontSize: settings.defaultLabelFontSize
      }
    };
    onSave(designConfig);
  };

  const handleCanvasClick = () => {
    setSelectedFieldId(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* AI Layout Loading Overlay */}
      {isAutoLayoutLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border rounded-lg p-6 shadow-lg flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="text-center">
              <h3 className="font-semibold text-lg">AI is Optimizing Your Layout</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Analyzing {sampleData?.length || 0} labels...
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Compact header with step indicator and navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          {stepInfo && (
            <span className="text-xs text-muted-foreground font-medium">
              Step {stepInfo.current} of {stepInfo.total}
            </span>
          )}
          <span className="text-sm font-semibold">Design Layout</span>
          
          {/* Navigation for sample data */}
          {sampleData && sampleData.length > 1 && (
            <div className="flex items-center gap-2 text-sm border-l pl-3 ml-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('⬅️ Previous label clicked, current:', currentDataIndex);
                  setCurrentDataIndex(Math.max(0, currentDataIndex - 1));
                }}
                disabled={currentDataIndex === 0}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-muted-foreground text-xs">
                Label {currentDataIndex + 1} of {sampleData.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('➡️ Next label clicked, current:', currentDataIndex);
                  setCurrentDataIndex(Math.min(sampleData.length - 1, currentDataIndex + 1));
                }}
                disabled={currentDataIndex >= sampleData.length - 1}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            import('sonner').then(m => m.toast.info('Drag fields to position them, resize using handles, and use toolbar to style. Use arrows to preview different labels.'));
          }}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>

      {/* Compact toolbar */}
      <div className="flex-shrink-0 border-b bg-muted/30">
        <CanvasToolbar
          zoom={settings.scale}
          onZoomIn={() => updateSettings({ scale: Math.min(5, settings.scale + 0.5) })}
          onZoomOut={() => updateSettings({ scale: Math.max(1, settings.scale - 0.5) })}
          showGrid={settings.showGrid}
          onToggleGrid={() => updateSettings({ showGrid: !settings.showGrid })}
          snapToGrid={settings.snapToGrid}
          onToggleSnap={() => updateSettings({ snapToGrid: !settings.snapToGrid })}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onAutoLayout={handleAutoLayout}
          isAutoLayoutLoading={isAutoLayoutLoading}
          showAllLabels={settings.showAllLabels}
          onToggleAllLabels={() => toggleAllFieldLabels(!settings.showAllLabels)}
          selectedField={selectedField}
          onUpdateFieldStyle={(updates) => {
            if (selectedFieldId) {
              updateFieldStyle(selectedFieldId, updates);
            }
          }}
          onToggleLabel={() => {
            if (selectedFieldId) {
              toggleFieldLabels(selectedFieldId);
            }
          }}
          onUpdateFieldType={(fieldType, typeConfig) => {
            if (selectedFieldId) {
              updateFieldType(selectedFieldId, fieldType, typeConfig);
            }
          }}
        />
      </div>

      {/* Main canvas area - takes all available space */}
      <div className="flex-1 overflow-auto bg-muted/20 p-4 min-h-0">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2">
            {/* Compact template info */}
            <div className="text-xs text-muted-foreground">
              {templateName} ({templateSize.width} × {templateSize.height}mm)
            </div>
            
            {/* Fabric.js Canvas */}
            <FabricLabelCanvas
              templateSize={templateSize}
              fields={fields}
              sampleData={sampleRow}
              scale={settings.scale}
              onFieldsChange={(updatedFields) => {
                // Update fields when modified on canvas
                updatedFields.forEach((updatedField, index) => {
                  const originalField = fields[index];
                  if (!originalField) return;
                  
                  // Update position and size if changed
                  if (updatedField.position.x !== originalField.position.x || 
                      updatedField.position.y !== originalField.position.y) {
                    moveField(originalField.id, updatedField.position);
                  }
                  
                  if (updatedField.size.width !== originalField.size.width || 
                      updatedField.size.height !== originalField.size.height) {
                    resizeField(originalField.id, updatedField.size);
                  }
                });
                finalizeFieldPositions();
              }}
              onCanvasReady={(canvas) => {
                // Canvas is ready - can add custom event handlers here if needed
                console.log('✅ Fabric canvas initialized');
              }}
            />
          </div>
        </div>
      </div>

      {/* Compact action buttons - fixed at bottom */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t bg-background">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Back
          </Button>
          {lastLayoutData && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runDiagnostic}
              disabled={isDiagnosticLoading}
            >
              <Bug className="h-4 w-4 mr-2" />
              Diagnose Layout
            </Button>
          )}
        </div>
        <Button size="sm" onClick={handleSave}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Save Design
        </Button>
      </div>

      {/* Diagnostic Modal */}
      <DiagnosticModal
        open={isDiagnosticOpen}
        onOpenChange={setIsDiagnosticOpen}
        diagnostic={diagnosticResult}
        isLoading={isDiagnosticLoading}
      />
    </div>
  );
}
