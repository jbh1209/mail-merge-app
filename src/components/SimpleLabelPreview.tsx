import { useMemo } from 'react';
import { mmToPx } from '@/lib/canvas-utils';
import { detectTextOverflow } from '@/lib/text-measurement-utils';

interface SimpleLabelPreviewProps {
  template: any;
  designConfig: any;
  dataRow: any;
  fieldMappings: Record<string, string>;
  labelIndex: number;
}

export function SimpleLabelPreview({
  template,
  designConfig,
  dataRow,
  fieldMappings,
  labelIndex
}: SimpleLabelPreviewProps) {
  const labelWidthMm = template.width_mm;
  const labelHeightMm = template.height_mm;
  const fields = designConfig?.fields || [];

  // Calculate preview scale to fit viewport
  const previewScale = useMemo(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const labelWidthPx = mmToPx(labelWidthMm, 1);
    const labelHeightPx = mmToPx(labelHeightMm, 1);
    
    const scaleByWidth = (viewportWidth * 0.70) / labelWidthPx;
    const scaleByHeight = (viewportHeight * 0.80) / labelHeightPx;
    const optimalScale = Math.min(scaleByWidth, scaleByHeight, 5);
    
    return Math.max(1.5, optimalScale);
  }, [labelWidthMm, labelHeightMm]);

  const labelWidthPx = mmToPx(labelWidthMm, previewScale);
  const labelHeightPx = mmToPx(labelHeightMm, previewScale);

  // Detect overset fields
  const oversetFields = useMemo(() => {
    const oversets = new Set<string>();
    
    fields.forEach((field: any) => {
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
        oversets.add(field.id);
      }
    });
    
    return oversets;
  }, [fields, dataRow, fieldMappings]);

  const renderField = (field: any) => {
    const dataColumn = fieldMappings[field.templateField];
    const dataValue = dataRow[dataColumn] || field.templateField;
    
    const isOverset = oversetFields.has(field.id);
    
    const scaledX = mmToPx(field.position.x, previewScale);
    const scaledY = mmToPx(field.position.y, previewScale);
    const scaledWidth = mmToPx(field.size.width, previewScale);
    const scaledHeight = mmToPx(field.size.height, previewScale);
    
    // Convert font size from points to pixels, then scale
    const fontSizeInPixels = (field.style.fontSize / 72) * 96;
    const scaledFontSize = fontSizeInPixels * previewScale;

    return (
      <div
        key={field.id}
        className={`absolute overflow-hidden flex items-start ${isOverset ? 'border-2 border-red-500' : ''}`}
        style={{
          left: `${scaledX}px`,
          top: `${scaledY}px`,
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          padding: '2px',
        }}
      >
        <span
          style={{
            fontSize: `${scaledFontSize}px`,
            fontFamily: field.style.fontFamily,
            fontWeight: field.style.fontWeight,
            textAlign: field.style.textAlign,
            color: field.style.color,
            whiteSpace: field.style.whiteSpace || 'normal',
            wordWrap: field.style.wordWrap || 'normal',
            lineHeight: field.style.lineHeight || '1.2',
            display: field.style.display || 'block',
          }}
        >
          {String(dataValue)}
        </span>
      </div>
    );
  };

  return (
    <div className="relative bg-white shadow-2xl" style={{ width: `${labelWidthPx}px`, height: `${labelHeightPx}px` }}>
      {fields.map(renderField)}
    </div>
  );
}
