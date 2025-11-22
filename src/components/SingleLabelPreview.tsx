import { useMemo } from 'react';
import { FieldConfig, mmToPx, generateSampleText } from '@/lib/canvas-utils';
import { detectTextOverflow } from '@/lib/text-measurement-utils';

interface SingleLabelPreviewProps {
  template: any;
  designConfig: any;
  dataRow: any;
  fieldMappings: Record<string, string>;
  labelIndex: number;
}

export function SingleLabelPreview({
  template,
  designConfig,
  dataRow,
  fieldMappings,
  labelIndex
}: SingleLabelPreviewProps) {
  const fields: FieldConfig[] = designConfig?.fields || [];
  
  const labelWidthMm = template.width_mm || 101.6;
  const labelHeightMm = template.height_mm || 50.8;

  // Calculate viewport-aware scale for preview
  const calculatePreviewScale = (): number => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Target: fill 70% of viewport width OR 80% of viewport height, whichever is smaller
    const labelWidthPx = mmToPx(labelWidthMm, 1); // at scale 1
    const labelHeightPx = mmToPx(labelHeightMm, 1); // at scale 1
    
    const scaleByWidth = (viewportWidth * 0.70) / labelWidthPx;
    const scaleByHeight = (viewportHeight * 0.80) / labelHeightPx;
    
    // Use the smaller scale to ensure it fits
    const optimalScale = Math.min(scaleByWidth, scaleByHeight, 5); // Cap at 5x
    
    console.log('📐 PREVIEW SCALE CALCULATION:', {
      viewportWidth,
      viewportHeight,
      labelWidthPx: labelWidthPx.toFixed(1),
      labelHeightPx: labelHeightPx.toFixed(1),
      scaleByWidth: scaleByWidth.toFixed(2),
      scaleByHeight: scaleByHeight.toFixed(2),
      optimalScale: optimalScale.toFixed(2)
    });
    
    return Math.max(1.5, optimalScale); // Minimum 1.5x for readability
  };

  const previewScale = calculatePreviewScale();
  const labelWidth = mmToPx(labelWidthMm, previewScale);
  const labelHeight = mmToPx(labelHeightMm, previewScale);

  console.log('🖼️ PREVIEW RENDER:', {
    previewScale: previewScale.toFixed(2),
    labelWidthMm,
    labelHeightMm,
    labelWidthPx: labelWidth.toFixed(1),
    labelHeightPx: labelHeight.toFixed(1),
    fieldsCount: fields.length
  });

  // Detect overset fields for this label
  const oversetFields = useMemo(() => {
    const oversets: { fieldName: string; overflowPercentage: number }[] = [];
    
    fields.forEach(field => {
      if (field.fieldType !== 'text') return;
      
      const dataColumn = fieldMappings[field.templateField];
      if (!dataColumn) return;
      
      const text = String(dataRow[dataColumn] || '');
      if (!text) return;

      // CRITICAL: Use scale=1 for overset detection (actual label dimensions)
      const containerWidth = mmToPx(field.size.width, 1);
      const containerHeight = mmToPx(field.size.height, 1);
      
      const overflow = detectTextOverflow(
        text,
        containerWidth,
        containerHeight,
        field.style.fontSize,
        field.style.fontFamily,
        field.style.fontWeight
      );

      if (overflow.hasOverflow) {
        console.log(`🚨 OVERSET DETECTED: "${field.templateField}"`, {
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          containerWidth: containerWidth.toFixed(1),
          containerHeight: containerHeight.toFixed(1),
          fontSize: field.style.fontSize,
          overflowPercentage: overflow.overflowPercentage.toFixed(1) + '%'
        });
        oversets.push({
          fieldName: field.templateField,
          overflowPercentage: overflow.overflowPercentage
        });
      }
    });

    return oversets;
  }, [dataRow, fields, fieldMappings, template]);

  const renderField = (field: FieldConfig) => {
    const dataColumn = fieldMappings[field.templateField];
    const value = dataColumn ? String(dataRow[dataColumn] || '') : generateSampleText(field.templateField);

    // Use preview scale for display
    const x = mmToPx(field.position.x, previewScale);
    const y = mmToPx(field.position.y, previewScale);
    const width = mmToPx(field.size.width, previewScale);
    const height = mmToPx(field.size.height, previewScale);

    const hasOverflow = oversetFields.some(o => o.fieldName === field.templateField);

    const style = {
      fontSize: `${field.style.fontSize * previewScale}pt`,
      fontFamily: field.style.fontFamily,
      fontWeight: field.style.fontWeight,
      textAlign: field.style.textAlign,
      color: field.style.color,
    };

    console.log(`📍 RENDERING FIELD "${field.templateField}":`, {
      position: { x: field.position.x.toFixed(1), y: field.position.y.toFixed(1) },
      positionPx: { x: x.toFixed(1), y: y.toFixed(1) },
      size: { width: field.size.width.toFixed(1), height: field.size.height.toFixed(1) },
      sizePx: { width: width.toFixed(1), height: height.toFixed(1) },
      fontSize: field.style.fontSize,
      fontSizeScaled: `${field.style.fontSize * previewScale}pt`,
      previewScale: previewScale.toFixed(2),
      value: value.substring(0, 30) + (value.length > 30 ? '...' : '')
    });

    return (
      <div
        key={field.id}
        className={`absolute px-1 ${
          hasOverflow ? 'border-4 border-destructive bg-destructive/20' : ''
        }`}
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          overflow: 'hidden',
          whiteSpace: 'normal',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          ...style
        }}
        title={hasOverflow ? `⚠️ ${field.templateField}: Text overflow detected` : field.templateField}
      >
        {field.showLabel && (
          <div className="text-muted-foreground text-[6px] mb-0.5 uppercase">
            {field.templateField}
          </div>
        )}
        <div 
          className={hasOverflow ? 'text-destructive font-bold' : ''}
          style={{
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
        >
          {value}
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div
        className="relative bg-white shadow-2xl border-2 border-border"
        style={{
          width: `${labelWidth}px`,
          height: `${labelHeight}px`,
        }}
      >
        {fields.map(field => renderField(field))}
        
        {/* Label number indicator */}
        <div className="absolute -top-8 left-0 text-white/50 text-xs">
          Label #{labelIndex + 1}
        </div>
      </div>
    </div>
  );
}
