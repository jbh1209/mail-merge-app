import { useMemo } from 'react';
import { mmToPx } from '@/lib/canvas-utils';

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

  const renderField = (field: any) => {
    let dataValue = '';
    
    // Handle address_block with combined fields
    if (field.fieldType === 'address_block' && field.combinedFields) {
      const lines = field.combinedFields
        .map((fieldName: string) => {
          const dataColumn = fieldMappings[fieldName];
          return dataColumn ? String(dataRow[dataColumn] || '').trim() : '';
        })
        .filter((line: string) => line && line.toLowerCase() !== 'null');
      dataValue = lines.join('\n');
    } else {
      // Regular single field
      const dataColumn = fieldMappings[field.templateField];
      dataValue = dataColumn ? String(dataRow[dataColumn] || '') : field.templateField;
    }
    
    const scaledX = mmToPx(field.position.x, previewScale);
    const scaledY = mmToPx(field.position.y, previewScale);
    const scaledWidth = mmToPx(field.size.width, previewScale);
    const scaledHeight = mmToPx(field.size.height, previewScale);
    
    // Convert pt to px at base scale, then scale proportionally
    const baseFontSizePx = (field.style.fontSize / 72) * 96;
    const scaledFontSizePx = baseFontSizePx * previewScale;

    return (
      <div
        key={field.id}
        className="absolute overflow-hidden"
        style={{
          left: `${scaledX}px`,
          top: `${scaledY}px`,
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          padding: '2px',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            fontSize: `${scaledFontSizePx}px`,
            fontFamily: field.style.fontFamily,
            fontWeight: field.style.fontWeight,
            textAlign: field.style.textAlign,
            color: field.style.color,
            whiteSpace: field.fieldType === 'address_block' ? 'pre-line' : field.style.whiteSpace || 'normal',
            wordWrap: field.style.wordWrap || 'break-word',
            lineHeight: field.style.lineHeight || '1.2',
            display: 'block',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box'
          }}
        >
          {String(dataValue)}
        </div>
      </div>
    );
  };

  return (
    <div className="relative bg-white shadow-2xl" style={{ width: `${labelWidthPx}px`, height: `${labelHeightPx}px` }}>
      {fields.map(renderField)}
    </div>
  );
}
