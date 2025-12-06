// ============================================================================
// CANVAS KEYBOARD SHORTCUTS HOOK
// ============================================================================

import { useEffect, useCallback, useRef } from 'react';
import { DesignElement } from '@/lib/editor/types';

interface UseCanvasKeyboardProps {
  selectedElementIds: string[];
  elements: DesignElement[];
  onDeleteElements: (ids: string[]) => void;
  onDuplicateElements: (ids: string[]) => void;
  onNudgeElements: (ids: string[], dx: number, dy: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  enabled?: boolean;
}

export function useCanvasKeyboard({
  selectedElementIds,
  elements,
  onDeleteElements,
  onDuplicateElements,
  onNudgeElements,
  onSelectAll,
  onClearSelection,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  enabled = true,
}: UseCanvasKeyboardProps) {
  // Use refs to avoid stale closures
  const selectedIdsRef = useRef(selectedElementIds);
  selectedIdsRef.current = selectedElementIds;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if typing in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const hasSelection = selectedIdsRef.current.length > 0;
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const nudgeAmount = isShift ? 10 : 1; // 10mm with shift, 1mm without

    switch (e.key) {
      // Delete selected elements
      case 'Delete':
      case 'Backspace':
        if (hasSelection) {
          e.preventDefault();
          onDeleteElements(selectedIdsRef.current);
        }
        break;

      // Duplicate (Ctrl+D)
      case 'd':
      case 'D':
        if (isCtrl && hasSelection) {
          e.preventDefault();
          onDuplicateElements(selectedIdsRef.current);
        }
        break;

      // Select All (Ctrl+A)
      case 'a':
      case 'A':
        if (isCtrl) {
          e.preventDefault();
          onSelectAll();
        }
        break;

      // Copy (Ctrl+C)
      case 'c':
      case 'C':
        if (isCtrl && hasSelection) {
          e.preventDefault();
          onCopy();
        }
        break;

      // Paste (Ctrl+V)
      case 'v':
      case 'V':
        if (isCtrl) {
          e.preventDefault();
          onPaste();
        }
        break;

      // Undo (Ctrl+Z)
      case 'z':
      case 'Z':
        if (isCtrl && !isShift && onUndo) {
          e.preventDefault();
          onUndo();
        } else if (isCtrl && isShift && onRedo) {
          e.preventDefault();
          onRedo();
        }
        break;

      // Redo (Ctrl+Y or Ctrl+Shift+Z)
      case 'y':
      case 'Y':
        if (isCtrl && onRedo) {
          e.preventDefault();
          onRedo();
        }
        break;

      // Escape - Clear selection
      case 'Escape':
        e.preventDefault();
        onClearSelection();
        break;

      // Arrow keys - Nudge
      case 'ArrowUp':
        if (hasSelection) {
          e.preventDefault();
          onNudgeElements(selectedIdsRef.current, 0, -nudgeAmount);
        }
        break;

      case 'ArrowDown':
        if (hasSelection) {
          e.preventDefault();
          onNudgeElements(selectedIdsRef.current, 0, nudgeAmount);
        }
        break;

      case 'ArrowLeft':
        if (hasSelection) {
          e.preventDefault();
          onNudgeElements(selectedIdsRef.current, -nudgeAmount, 0);
        }
        break;

      case 'ArrowRight':
        if (hasSelection) {
          e.preventDefault();
          onNudgeElements(selectedIdsRef.current, nudgeAmount, 0);
        }
        break;
    }
  }, [enabled, onDeleteElements, onDuplicateElements, onNudgeElements, onSelectAll, onClearSelection, onCopy, onPaste, onUndo, onRedo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
