import { useMemo } from 'react';
import { FieldConfig, mmToPx, generateSampleText } from '@/lib/canvas-utils';
import { calculateLayout, getLabelPosition } from '@/lib/label-layout-utils';

interface LabelPagePreviewProps {
  template: any;
  designConfig: any;
  dataRows: any[];
  fieldMappings: Record<string, string>;
  pageIndex: number;
  scale?: number;
  onLabelClick?: (labelIndex: number) => void;
  highlightedLabelIndex?: number;
}

interface LabelOverset {
  labelIndex: number;
  fieldName: string;
  overflowPercentage: number;
}

export function LabelPagePreview({
  template,
  designConfig,
  dataRows,
  fieldMappings,
  pageIndex,
  scale = 0.5,
  onLabelClick,
  highlightedLabelIndex
}: LabelPagePreviewProps) {
  const layout = useMemo(() => calculateLayout(template), [template]);
  const fields: FieldConfig[] = designConfig?.fields || [];

  const renderField = (field: FieldConfig, dataRow: any, offsetX: number, offsetY: number) => {
    const dataColumn = fieldMappings[field.templateField];
    const value = dataColumn ? String(dataRow[dataColumn] || '') : generateSampleText(field.templateField);

    const x = mmToPx(field.position.x, scale);
    const y = mmToPx(field.position.y, scale);
    const width = mmToPx(field.size.width, scale);
    const height = mmToPx(field.size.height, scale);

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
        className="absolute overflow-hidden px-1"
        style={{
          left: `${offsetX + x}px`,
          top: `${offsetY + y}px`,
          width: `${width}px`,
          height: `${height}px`,
          ...style
        }}
      >
        {field.showLabel && (
          <div className="text-muted-foreground text-[6px] mb-0.5 uppercase">
            {field.templateField}
          </div>
        )}
        <div className="truncate">{value}</div>
      </div>
    );
  };

  const renderLabel = (dataRow: any, labelIndex: number) => {
    const position = getLabelPosition(labelIndex, layout);
    const offsetX = mmToPx(position.x, scale);
    const offsetY = mmToPx(position.y, scale);
    const labelWidth = mmToPx(layout.labelWidth, scale);
    const labelHeight = mmToPx(layout.labelHeight, scale);

    const isHighlighted = labelIndex === highlightedLabelIndex;

    return (
      <div
        key={labelIndex}
        className={`absolute border transition-all border-border ${
          isHighlighted ? 'ring-2 ring-primary shadow-lg' : ''
        } ${onLabelClick ? 'cursor-pointer hover:border-primary' : ''}`}
        style={{
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${labelWidth}px`,
          height: `${labelHeight}px`,
        }}
        onClick={() => onLabelClick?.(labelIndex)}
      >
        {fields.map(field => renderField(field, dataRow, 0, 0))}
      </div>
    );
  };

  const pageWidth = mmToPx(215.9, scale); // A4 width
  const pageHeight = mmToPx(279.4, scale); // A4 height

  return (
    <div 
      className="relative bg-white shadow-lg mx-auto"
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
      }}
    >
      {dataRows.map((row, index) => renderLabel(row, index))}
      
      {/* Page number */}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        Page {pageIndex + 1}
      </div>
    </div>
  );
}
