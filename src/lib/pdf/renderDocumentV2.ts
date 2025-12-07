// =============================================================================
// PDF RENDERING - V2 SKELETON
// =============================================================================
// Placeholder for the updated PDF pipeline. The function signature matches
// expected usage so the rendering engine can be filled in incrementally.
// =============================================================================

import type { DesignDocument } from '@/lib/editor-v2/types';

export interface RenderDocumentV2Result {
  blob: Blob;
  warnings: string[];
}

export async function renderDocumentV2(document: DesignDocument): Promise<RenderDocumentV2Result> {
  const warnings = ['renderDocumentV2 is currently a stub'];
  const emptyPdf = new Blob([], { type: 'application/pdf' });
  void document; // placeholder usage until renderer is implemented

  return {
    blob: emptyPdf,
    warnings
  };
}
