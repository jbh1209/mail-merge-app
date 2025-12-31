/**
 * Polotno Custom Panels Bridge
 * 
 * This file is plain JavaScript to avoid TypeScript processing Polotno types.
 * All custom panel definitions are created here and exported for use in React components.
 */

import React from 'react';
import { SectionTab } from 'polotno/side-panel';

// Icons as simple SVG components (avoiding lucide-react in JS for simplicity)
const TypeIcon = () => React.createElement('svg', {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
}, React.createElement('polyline', { points: '4 7 4 4 20 4 20 7' }),
   React.createElement('line', { x1: 9, y1: 20, x2: 15, y2: 20 }),
   React.createElement('line', { x1: 12, y1: 4, x2: 12, y2: 20 }));

const QrCodeIcon = () => React.createElement('svg', {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
}, React.createElement('rect', { x: 3, y: 3, width: 7, height: 7 }),
   React.createElement('rect', { x: 14, y: 3, width: 7, height: 7 }),
   React.createElement('rect', { x: 3, y: 14, width: 7, height: 7 }),
   React.createElement('rect', { x: 14, y: 14, width: 3, height: 3 }),
   React.createElement('rect', { x: 18, y: 14, width: 3, height: 3 }),
   React.createElement('rect', { x: 14, y: 18, width: 3, height: 3 }),
   React.createElement('rect', { x: 18, y: 18, width: 3, height: 3 }));

const ImageIcon = () => React.createElement('svg', {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
}, React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
   React.createElement('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
   React.createElement('path', { d: 'M21 15l-5-5L5 21' }));

const HashIcon = () => React.createElement('svg', {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
}, React.createElement('line', { x1: 4, y1: 9, x2: 20, y2: 9 }),
   React.createElement('line', { x1: 4, y1: 15, x2: 20, y2: 15 }),
   React.createElement('line', { x1: 10, y1: 3, x2: 8, y2: 21 }),
   React.createElement('line', { x1: 16, y1: 3, x2: 14, y2: 21 }));

/**
 * Create a VDP Fields panel section definition
 */
export function createVdpFieldsSection(panelComponent) {
  return {
    name: 'vdp-fields',
    Tab: (props) => React.createElement(SectionTab, { name: 'Data Fields', ...props }, 
      React.createElement(TypeIcon)),
    Panel: panelComponent,
  };
}

/**
 * Create a Barcodes panel section definition
 */
export function createBarcodesSection(panelComponent) {
  return {
    name: 'barcodes',
    Tab: (props) => React.createElement(SectionTab, { name: 'Barcodes', ...props },
      React.createElement(QrCodeIcon)),
    Panel: panelComponent,
  };
}

/**
 * Create a Project Images panel section definition
 */
export function createProjectImagesSection(panelComponent) {
  return {
    name: 'project-images',
    Tab: (props) => React.createElement(SectionTab, { name: 'Images', ...props },
      React.createElement(ImageIcon)),
    Panel: panelComponent,
  };
}

/**
 * Create a Sequence panel section definition
 */
export function createSequenceSection(panelComponent) {
  return {
    name: 'sequence',
    Tab: (props) => React.createElement(SectionTab, { name: 'Sequence', ...props },
      React.createElement(HashIcon)),
    Panel: panelComponent,
  };
}

/**
 * Get default Polotno sections (must be called after loadPolotnoModules)
 */
export async function getDefaultSections() {
  const sidePanel = await import('polotno/side-panel');
  return sidePanel.DEFAULT_SECTIONS;
}
