/**
 * Image Validation Utilities for VDP
 * Validates that all image references in data have corresponding uploaded images
 */

export interface ImageValidationResult {
  valid: boolean;
  matched: number;
  missing: string[];
  total: number;
  matchRate: number;
}

export interface UploadedImage {
  name: string;
  url: string;
  path: string;
}

/**
 * Validate that all image references in data rows have matching uploaded images
 */
export function validateImageReferences(
  dataRows: Record<string, any>[],
  imageColumn: string,
  uploadedImages: UploadedImage[]
): ImageValidationResult {
  // Build a set of uploaded image names (case-insensitive for matching)
  const uploadedSet = new Set(
    uploadedImages.map(img => normalizeImageName(img.name))
  );

  // Extract all unique image references from data
  const referencedImages = new Set<string>();
  for (const row of dataRows) {
    const value = row[imageColumn];
    if (value && typeof value === 'string' && value.trim()) {
      referencedImages.add(value.trim());
    }
  }

  // Find missing images
  const missing: string[] = [];
  let matched = 0;

  for (const ref of referencedImages) {
    const normalized = normalizeImageName(ref);
    if (uploadedSet.has(normalized)) {
      matched++;
    } else {
      missing.push(ref);
    }
  }

  const total = referencedImages.size;
  const matchRate = total > 0 ? Math.round((matched / total) * 100) : 100;

  return {
    valid: missing.length === 0,
    matched,
    missing,
    total,
    matchRate,
  };
}

/**
 * Normalize image name for matching
 * - Removes extension if comparing with/without
 * - Lowercases for case-insensitive matching
 */
function normalizeImageName(name: string): string {
  // Remove Windows or Unix path prefixes
  let baseName = name;
  if (name.includes('\\')) {
    // Windows path: C:\Users\jimmy\OneDrive\Pictures\test\raya and rolo.jpg
    baseName = name.split('\\').pop() || name;
  } else if (name.includes('/')) {
    // Unix path or URL
    baseName = name.split('/').pop() || name;
  }
  
  // Remove URL query parameters if present
  if (baseName.includes('?')) {
    baseName = baseName.split('?')[0];
  }
  
  // Remove extension for flexible matching
  const withoutExt = baseName.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, '');
  return withoutExt.toLowerCase().trim();
}

/**
 * Find the matching uploaded image for a reference value
 */
export function findMatchingImage(
  reference: string,
  uploadedImages: UploadedImage[]
): UploadedImage | null {
  if (!reference || !reference.trim()) return null;

  const normalizedRef = normalizeImageName(reference);

  // Try exact match first (with extension)
  const exactMatch = uploadedImages.find(
    img => img.name.toLowerCase() === reference.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // Try normalized match (without extension)
  const normalizedMatch = uploadedImages.find(
    img => normalizeImageName(img.name) === normalizedRef
  );
  if (normalizedMatch) return normalizedMatch;

  return null;
}

/**
 * Get signed URL for an image in private storage
 */
export async function getSignedImageUrl(
  supabase: any,
  imagePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('project-assets')
      .createSignedUrl(imagePath, expiresIn);

    if (error) {
      console.error('Failed to get signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error getting signed URL:', err);
    return null;
  }
}

/**
 * Batch get signed URLs for multiple images
 */
export async function batchGetSignedUrls(
  supabase: any,
  imagePaths: string[],
  expiresIn: number = 3600
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  // Supabase supports batch signed URL generation
  const { data, error } = await supabase.storage
    .from('project-assets')
    .createSignedUrls(imagePaths, expiresIn);

  if (error) {
    console.error('Failed to get signed URLs:', error);
    return urlMap;
  }

  for (const item of data || []) {
    if (item.signedUrl) {
      urlMap.set(item.path, item.signedUrl);
    }
  }

  return urlMap;
}