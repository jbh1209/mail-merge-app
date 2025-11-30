// Alignment utility functions for canvas elements
import { FieldConfig, Size } from './canvas-utils';

/**
 * Align fields to the left edge
 */
export function alignFieldsLeft(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  const minX = fields.length === 1 ? 0 : Math.min(...fields.map(f => f.position.x));
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, x: minX }
  }));
}

/**
 * Align fields to horizontal center
 */
export function alignFieldsCenter(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  if (fields.length === 1) {
    // Single field: center in canvas
    const field = fields[0];
    return [{
      ...field,
      position: { ...field.position, x: (bounds.width - field.size.width) / 2 }
    }];
  }
  
  // Multiple fields: align centers to leftmost field's center
  const leftmost = fields.reduce((min, f) => 
    f.position.x < min.position.x ? f : min
  );
  const centerX = leftmost.position.x + leftmost.size.width / 2;
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, x: centerX - f.size.width / 2 }
  }));
}

/**
 * Align fields to the right edge
 */
export function alignFieldsRight(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  if (fields.length === 1) {
    // Single field: align to right edge
    const field = fields[0];
    return [{
      ...field,
      position: { ...field.position, x: bounds.width - field.size.width }
    }];
  }
  
  // Multiple fields: align to rightmost edge
  const maxX = Math.max(...fields.map(f => f.position.x + f.size.width));
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, x: maxX - f.size.width }
  }));
}

/**
 * Align fields to the top edge
 */
export function alignFieldsTop(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  const minY = fields.length === 1 ? 0 : Math.min(...fields.map(f => f.position.y));
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, y: minY }
  }));
}

/**
 * Align fields to vertical middle
 */
export function alignFieldsMiddle(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  if (fields.length === 1) {
    // Single field: center vertically in canvas
    const field = fields[0];
    return [{
      ...field,
      position: { ...field.position, y: (bounds.height - field.size.height) / 2 }
    }];
  }
  
  // Multiple fields: align centers to topmost field's center
  const topmost = fields.reduce((min, f) => 
    f.position.y < min.position.y ? f : min
  );
  const centerY = topmost.position.y + topmost.size.height / 2;
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, y: centerY - f.size.height / 2 }
  }));
}

/**
 * Align fields to the bottom edge
 */
export function alignFieldsBottom(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length === 0) return fields;
  
  if (fields.length === 1) {
    // Single field: align to bottom edge
    const field = fields[0];
    return [{
      ...field,
      position: { ...field.position, y: bounds.height - field.size.height }
    }];
  }
  
  // Multiple fields: align to bottommost edge
  const maxY = Math.max(...fields.map(f => f.position.y + f.size.height));
  
  return fields.map(f => ({
    ...f,
    position: { ...f.position, y: maxY - f.size.height }
  }));
}

/**
 * Distribute fields horizontally with even spacing
 */
export function distributeHorizontally(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length <= 2) return fields;
  
  // Sort by x position
  const sorted = [...fields].sort((a, b) => a.position.x - b.position.x);
  
  const leftmost = sorted[0];
  const rightmost = sorted[sorted.length - 1];
  
  const totalWidth = (rightmost.position.x + rightmost.size.width) - leftmost.position.x;
  const totalFieldWidth = sorted.reduce((sum, f) => sum + f.size.width, 0);
  const totalGap = totalWidth - totalFieldWidth;
  const gapSize = totalGap / (sorted.length - 1);
  
  let currentX = leftmost.position.x;
  
  return sorted.map((f, i) => {
    if (i === 0) return f;
    
    currentX += sorted[i - 1].size.width + gapSize;
    return {
      ...f,
      position: { ...f.position, x: currentX }
    };
  });
}

/**
 * Distribute fields vertically with even spacing
 */
export function distributeVertically(fields: FieldConfig[], bounds: Size): FieldConfig[] {
  if (fields.length <= 2) return fields;
  
  // Sort by y position
  const sorted = [...fields].sort((a, b) => a.position.y - b.position.y);
  
  const topmost = sorted[0];
  const bottommost = sorted[sorted.length - 1];
  
  const totalHeight = (bottommost.position.y + bottommost.size.height) - topmost.position.y;
  const totalFieldHeight = sorted.reduce((sum, f) => sum + f.size.height, 0);
  const totalGap = totalHeight - totalFieldHeight;
  const gapSize = totalGap / (sorted.length - 1);
  
  let currentY = topmost.position.y;
  
  return sorted.map((f, i) => {
    if (i === 0) return f;
    
    currentY += sorted[i - 1].size.height + gapSize;
    return {
      ...f,
      position: { ...f.position, y: currentY }
    };
  });
}
