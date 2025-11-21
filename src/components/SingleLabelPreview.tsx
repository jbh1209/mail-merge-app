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
  
  // Calculate optimal scale to fit the screen nicely
  const viewportWidth = window.innerWidth * 0.7; // 70% of viewport
  const viewportHeight = window.innerHeight * 0.7; // 70% of viewport
  
  const labelWidthMm = template.width_mm || 101.6;
  const labelHeightMm = template.height_mm || 50.8;
  
  // Calculate scale to fit viewport
  const scaleByWidth = viewportWidth / mmToPx(labelWidthMm, 1);
  const scaleByHeight = viewportHeight / mmToPx(labelHeightMm, 1);
  const scale = Math.min(scaleByWidth, scaleByHeight, 3); // Max 3x zoom

  const labelWidth = mmToPx(labelWidthMm, scale);
  const labelHeight = mmToPx(labelHeightMm, scale);

  // Detect overset fields for this label
  const oversetFields = useMemo(() => {
    const oversets: { fieldName: string; overflowPercentage: number }[] = [];
    
    fields.forEach(field => {
      if (field.fieldType !== 'text') return;
      
      const dataColumn = fieldMappings[field.templateField];
      if (!dataColumn) return;
      
      const text = String(dataRow[dataColumn] || '');
      if (!text) return;

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
        oversets.push({
          fieldName: field.templateField,
          overflowPercentage: overflow.overflowPercentage
        });
      }
    });

    return oversets;
  }, [dataRow, fields, fieldMappings]);

  const renderField = (field: FieldConfig) => {
    const dataColumn = fieldMappings[field.templateField];
    const value = dataColumn ? String(dataRow[dataColumn] || '') : generateSampleText(field.templateField);

    const x = mmToPx(field.position.x, scale);
    const y = mmToPx(field.position.y, scale);
    const width = mmToPx(field.size.width, scale);
    const height = mmToPx(field.size.height, scale);

    const hasOverflow = oversetFields.some(o => o.fieldName === field.templateField);

    const style = {
      fontSize: `${field.style.fontSize * scale}pt`,
      fontFamily: field.style.fontFamily,
      fontWeight: field.style.fontWeight,
      textAlign: field.style.textAlign,
      color: field.style.color,
    };

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
