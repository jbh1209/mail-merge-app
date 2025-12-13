import { FieldType } from './canvas-utils';

export interface FieldSuggestion {
  fieldName: string;
  suggestedType: 'barcode' | 'qrcode' | 'sequence' | 'image';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  recommendedFormat?: string; // For barcodes
}

/**
 * Patterns for detecting different field types from column names
 */
const DETECTION_PATTERNS = {
  barcode: {
    high: [
      /^barcode$/i,
      /^bar[-_\s]code$/i,
      /^sku$/i,
      /^upc$/i,
      /^ean$/i,
      /^ean[-_]?13$/i,
      /^product[-_\s]code$/i,
      /^item[-_\s]code$/i,
    ],
    medium: [
      /barcode/i,
      /^code$/i,
      /^product[-_\s]id$/i,
      /^item[-_\s]id$/i,
      /^part[-_\s]number$/i,
      /^catalog$/i,
      /^gtin$/i,
    ],
  },
  qrcode: {
    high: [
      /^qr$/i,
      /^qr[-_\s]code$/i,
      /^qrcode$/i,
    ],
    medium: [
      /qr/i,
      /^url$/i,
      /^link$/i,
      /^website$/i,
      /^web[-_\s]link$/i,
      /^tracking$/i,
      /^tracking[-_\s]url$/i,
      /^profile$/i,
      /^profile[-_\s]url$/i,
    ],
  },
  sequence: {
    high: [
      /^sequence$/i,
      /^seq$/i,
      /^number$/i,
      /^#$/,
      /^no$/i,
      /^serial$/i,
      /^serial[-_\s]number$/i,
    ],
    medium: [
      /sequence/i,
      /serial/i,
      /^id$/i,
      /^label[-_\s]number$/i,
      /^order[-_\s]number$/i,
      /^invoice[-_\s]number$/i,
      /[-_\s]number$/i,
      /[-_\s]no$/i,
    ],
  },
  image: {
    high: [
      /^image$/i,
      /^photo$/i,
      /^picture$/i,
      /^headshot$/i,
      /^avatar$/i,
      /^logo$/i,
      /^thumbnail$/i,
      /^img$/i,
    ],
    medium: [
      /image/i,
      /photo/i,
      /picture/i,
      /^portrait$/i,
      /^profile[-_\s]?pic$/i,
      /^product[-_\s]?image$/i,
      /^item[-_\s]?image$/i,
      /[-_\s]image$/i,
      /[-_\s]photo$/i,
      /[-_\s]pic$/i,
      /^icon$/i,
      /^badge[-_\s]?image$/i,
    ],
  },
};

/**
 * Detect potential barcode/QR/sequence/image fields from column names
 */
export function detectSpecialFields(columnNames: string[]): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = [];

  for (const fieldName of columnNames) {
    const trimmedName = fieldName.trim();
    if (!trimmedName) continue;

    // Check barcode patterns
    const barcodeMatch = matchPattern(trimmedName, DETECTION_PATTERNS.barcode);
    if (barcodeMatch) {
      suggestions.push({
        fieldName: trimmedName,
        suggestedType: 'barcode',
        confidence: barcodeMatch.confidence,
        reason: getBarcodeReason(trimmedName),
        recommendedFormat: getRecommendedBarcodeFormat(trimmedName),
      });
      continue; // Don't check other types if we found a match
    }

    // Check QR code patterns
    const qrcodeMatch = matchPattern(trimmedName, DETECTION_PATTERNS.qrcode);
    if (qrcodeMatch) {
      suggestions.push({
        fieldName: trimmedName,
        suggestedType: 'qrcode',
        confidence: qrcodeMatch.confidence,
        reason: getQRCodeReason(trimmedName),
      });
      continue;
    }

    // Check image patterns
    const imageMatch = matchPattern(trimmedName, DETECTION_PATTERNS.image);
    if (imageMatch) {
      suggestions.push({
        fieldName: trimmedName,
        suggestedType: 'image',
        confidence: imageMatch.confidence,
        reason: getImageReason(trimmedName),
      });
      continue;
    }

    // Check sequence patterns
    const sequenceMatch = matchPattern(trimmedName, DETECTION_PATTERNS.sequence);
    if (sequenceMatch) {
      suggestions.push({
        fieldName: trimmedName,
        suggestedType: 'sequence',
        confidence: sequenceMatch.confidence,
        reason: getSequenceReason(trimmedName),
      });
    }
  }

  // Sort by confidence (high first) and type priority
  return suggestions.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;

    // If same confidence, prioritize barcode > qrcode > image > sequence
    const typeOrder = { barcode: 0, qrcode: 1, image: 2, sequence: 3 };
    return typeOrder[a.suggestedType] - typeOrder[b.suggestedType];
  });
}

/**
 * Match field name against patterns
 */
function matchPattern(
  fieldName: string,
  patterns: { high: RegExp[]; medium: RegExp[] }
): { confidence: 'high' | 'medium' } | null {
  // Check high confidence patterns first
  for (const pattern of patterns.high) {
    if (pattern.test(fieldName)) {
      return { confidence: 'high' };
    }
  }

  // Check medium confidence patterns
  for (const pattern of patterns.medium) {
    if (pattern.test(fieldName)) {
      return { confidence: 'medium' };
    }
  }

  return null;
}

/**
 * Get human-readable reason for barcode suggestion
 */
function getBarcodeReason(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes('sku')) return 'SKU fields are commonly used for product barcodes';
  if (lower.includes('upc')) return 'UPC fields contain barcode data';
  if (lower.includes('ean')) return 'EAN fields contain barcode data';
  if (lower.includes('product')) return 'Product codes are often encoded as barcodes';
  if (lower.includes('item')) return 'Item codes work well as barcodes';
  return 'This field appears to contain barcode data';
}

/**
 * Get human-readable reason for QR code suggestion
 */
function getQRCodeReason(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes('url') || lower.includes('link')) return 'URLs are perfect for QR codes';
  if (lower.includes('website')) return 'Website addresses work well in QR codes';
  if (lower.includes('tracking')) return 'Tracking information can be encoded as QR codes';
  if (lower.includes('profile')) return 'Profile links are commonly shared via QR codes';
  return 'This field appears to be suitable for QR code encoding';
}

/**
 * Get human-readable reason for sequence suggestion
 */
function getSequenceReason(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes('serial')) return 'Serial numbers can be auto-generated as sequences';
  if (lower.includes('order')) return 'Order numbers work well with sequential numbering';
  if (lower.includes('invoice')) return 'Invoice numbers are typically sequential';
  if (lower === 'number' || lower === '#' || lower === 'no') {
    return 'This appears to be a numbering field';
  }
  return 'This field could benefit from sequential numbering';
}

/**
 * Get human-readable reason for image suggestion
 */
function getImageReason(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes('photo')) return 'Photo fields can display variable images per record';
  if (lower.includes('headshot') || lower.includes('portrait')) return 'Portrait images work well for ID badges and name tags';
  if (lower.includes('logo')) return 'Logo fields can display different company logos per record';
  if (lower.includes('avatar') || lower.includes('profile')) return 'Profile images for personalized output';
  if (lower.includes('product')) return 'Product images for catalogs and labels';
  if (lower.includes('thumbnail')) return 'Thumbnail images for compact previews';
  return 'This field appears to reference images that can vary per record';
}

/**
 * Recommend barcode format based on field name
 */
function getRecommendedBarcodeFormat(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes('ean')) return 'EAN13';
  if (lower.includes('upc')) return 'UPCA';
  if (lower.includes('code39') || lower.includes('39')) return 'CODE39';
  // CODE128 is the most versatile default
  return 'CODE128';
}

/**
 * Check if suggestions should be shown (at least one high or medium confidence)
 */
export function shouldShowSuggestions(suggestions: FieldSuggestion[]): boolean {
  return suggestions.some(s => s.confidence === 'high' || s.confidence === 'medium');
}

/**
 * Get icon name for suggestion type
 */
export function getSuggestionIcon(type: 'barcode' | 'qrcode' | 'sequence' | 'image'): string {
  switch (type) {
    case 'barcode':
      return 'BarChart3';
    case 'qrcode':
      return 'QrCode';
    case 'sequence':
      return 'Hash';
    case 'image':
      return 'Image';
  }
}

/**
 * Get display name for suggestion type
 */
export function getSuggestionDisplayName(type: 'barcode' | 'qrcode' | 'sequence' | 'image'): string {
  switch (type) {
    case 'barcode':
      return 'Barcode';
    case 'qrcode':
      return 'QR Code';
    case 'sequence':
      return 'Sequential Number';
    case 'image':
      return 'Variable Image';
  }
}
