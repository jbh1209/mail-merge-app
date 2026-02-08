/**
 * Scene Preflight Sanitizer
 * 
 * Detects and repairs non-finite numeric values (NaN, Infinity) in Polotno scene JSON
 * before sending to the VPS. This prevents the @polotno/pdf-export library from crashing
 * with "unsupported number: NaN" errors.
 * 
 * The sanitizer:
 * - Deep-walks the entire scene object
 * - Detects any number that fails Number.isFinite()
 * - Replaces invalid values with safe defaults (0)
 * - Returns a diagnostic report of all issues found
 * - Does NOT mutate the original scene (returns a clone)
 */

import type { PolotnoScene } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface SanitizationIssue {
  /** JSON path to the invalid value (e.g., "pages[0].children[12].fontSize") */
  path: string;
  /** The original invalid value */
  originalValue: unknown;
  /** The replacement value */
  replacedWith: number;
}

export interface SanitizationResult {
  /** The sanitized scene (cloned, not mutated) */
  sanitizedScene: PolotnoScene;
  /** List of all issues found and fixed */
  issues: SanitizationIssue[];
  /** Total count of values that were fixed */
  changedCount: number;
  /** Human-readable summary for error messages */
  summary: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum number of issues to track (prevents memory bloat on severely corrupted scenes) */
const MAX_TRACKED_ISSUES = 50;

/** Default replacement value for invalid numbers */
const DEFAULT_REPLACEMENT = 0;

// =============================================================================
// CORE SANITIZATION LOGIC
// =============================================================================

/**
 * Deep-walk an object and sanitize any non-finite numeric values.
 * Returns a new object (does not mutate the original).
 */
function deepSanitize(
  obj: unknown,
  path: string,
  issues: SanitizationIssue[]
): unknown {
  // Handle primitives
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if it's a number that needs fixing
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      // Track the issue (up to the limit)
      if (issues.length < MAX_TRACKED_ISSUES) {
        issues.push({
          path,
          originalValue: obj,
          replacedWith: DEFAULT_REPLACEMENT,
        });
      }
      return DEFAULT_REPLACEMENT;
    }
    return obj;
  }

  // Strings, booleans, functions - pass through unchanged
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      deepSanitize(item, `${path}[${index}]`, issues)
    );
  }

  // Handle plain objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const childPath = path ? `${path}.${key}` : key;
    result[key] = deepSanitize(value, childPath, issues);
  }
  return result;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Sanitize a Polotno scene for VPS export.
 * 
 * This function:
 * 1. Deep-clones the scene to avoid mutation
 * 2. Walks all properties looking for non-finite numbers
 * 3. Replaces NaN/Infinity with 0
 * 4. Returns a diagnostic report
 * 
 * @param scene - The Polotno scene to sanitize
 * @returns Result containing sanitized scene and diagnostic info
 */
export function sanitizePolotnoSceneForVps(scene: PolotnoScene): SanitizationResult {
  const issues: SanitizationIssue[] = [];
  
  // Deep-walk and sanitize (this also creates a clone)
  const sanitizedScene = deepSanitize(scene, '', issues) as PolotnoScene;
  
  // Build human-readable summary
  let summary: string;
  if (issues.length === 0) {
    summary = 'No invalid numeric values detected';
  } else {
    const firstIssues = issues.slice(0, 5);
    const paths = firstIssues.map(i => `${i.path}=${String(i.originalValue)}`).join(', ');
    const moreCount = issues.length > 5 ? ` (+${issues.length - 5} more)` : '';
    summary = `Fixed ${issues.length} invalid numeric value(s): ${paths}${moreCount}`;
  }

  return {
    sanitizedScene,
    issues,
    changedCount: issues.length,
    summary,
  };
}

/**
 * Quick check if a scene has any non-finite numbers.
 * Faster than full sanitization when you just need a boolean check.
 */
export function sceneHasInvalidNumbers(scene: PolotnoScene): boolean {
  let foundInvalid = false;

  function walk(obj: unknown): void {
    if (foundInvalid) return; // Early exit
    
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'number') {
      if (!Number.isFinite(obj)) {
        foundInvalid = true;
      }
      return;
    }
    
    if (typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        walk(item);
        if (foundInvalid) return;
      }
      return;
    }
    
    for (const value of Object.values(obj)) {
      walk(value);
      if (foundInvalid) return;
    }
  }

  walk(scene);
  return foundInvalid;
}

/**
 * Format sanitization result for inclusion in error messages.
 * Produces a compact string suitable for UI display.
 */
export function formatSanitizationForError(result: SanitizationResult): string {
  if (result.changedCount === 0) {
    return '';
  }
  
  const firstIssue = result.issues[0];
  const firstPath = firstIssue ? `first: ${firstIssue.path}` : '';
  return `Preflight fixed ${result.changedCount} invalid number(s); ${firstPath}`;
}

/**
 * Log sanitization issues to console in a readable format.
 */
export function logSanitizationReport(result: SanitizationResult): void {
  if (result.changedCount === 0) {
    console.log('[SceneSanitizer] ✓ No invalid numeric values detected');
    return;
  }

  console.warn(`[SceneSanitizer] ⚠️ Fixed ${result.changedCount} invalid numeric values:`);
  
  // Log as a table for easy reading
  const tableData = result.issues.slice(0, 20).map(issue => ({
    path: issue.path,
    was: String(issue.originalValue),
    now: issue.replacedWith,
  }));
  
  console.table(tableData);
  
  if (result.issues.length > 20) {
    console.warn(`[SceneSanitizer] ... and ${result.issues.length - 20} more issues (see full list in result.issues)`);
  }
}
