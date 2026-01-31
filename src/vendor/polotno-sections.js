/**
 * Polotno Custom Sections Builder
 * 
 * This file is plain JavaScript to avoid TypeScript processing Polotno types.
 * It builds custom section definitions that use our React panel components.
 */

import React from 'react';
import { getPolotnoComponents } from './polotno-runtime.js';

// Custom SVG icons matching Polotno's Blueprint style (20x20, strokeWidth 1.5)
const DataFieldsIcon = () => React.createElement('svg', {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}, [
  React.createElement('polyline', { key: 1, points: '4 7 4 4 20 4 20 7' }),
  React.createElement('line', { key: 2, x1: '9', y1: '20', x2: '15', y2: '20' }),
  React.createElement('line', { key: 3, x1: '12', y1: '4', x2: '12', y2: '20' }),
]);

const BarcodeIcon = () => React.createElement('svg', {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}, [
  React.createElement('rect', { key: 1, x: '3', y: '3', width: '7', height: '7', rx: '1' }),
  React.createElement('rect', { key: 2, x: '14', y: '3', width: '7', height: '7', rx: '1' }),
  React.createElement('rect', { key: 3, x: '3', y: '14', width: '7', height: '7', rx: '1' }),
  React.createElement('rect', { key: 4, x: '14', y: '14', width: '3', height: '3' }),
  React.createElement('rect', { key: 5, x: '18', y: '14', width: '3', height: '3' }),
  React.createElement('rect', { key: 6, x: '14', y: '18', width: '3', height: '3' }),
  React.createElement('rect', { key: 7, x: '18', y: '18', width: '3', height: '3' }),
]);

const ImageIcon = () => React.createElement('svg', {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}, [
  React.createElement('rect', { key: 1, x: '3', y: '3', width: '18', height: '18', rx: '2' }),
  React.createElement('circle', { key: 2, cx: '9', cy: '9', r: '2' }),
  React.createElement('path', { key: 3, d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }),
]);

const SequenceIcon = () => React.createElement('svg', {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}, [
  React.createElement('line', { key: 1, x1: '4', y1: '9', x2: '20', y2: '9' }),
  React.createElement('line', { key: 2, x1: '4', y1: '15', x2: '20', y2: '15' }),
  React.createElement('line', { key: 3, x1: '10', y1: '3', x2: '8', y2: '21' }),
  React.createElement('line', { key: 4, x1: '16', y1: '3', x2: '14', y2: '21' }),
]);

/**
 * Create VDP fields section for the side panel
 * @param {React.ComponentType} PanelComponent - The panel component to render
 * @param {object|function} panelProps - Props object or factory function that returns props
 */
export function createVdpFieldsSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'vdp-fields',
    Tab: (props) => React.createElement(SectionTab, { name: 'Data Fields', ...props },
      React.createElement(DataFieldsIcon)),
    Panel: ({ store }) => {
      const resolvedProps = typeof panelProps === 'function' ? panelProps() : panelProps;
      return React.createElement(PanelComponent, { store, ...resolvedProps });
    },
  };
}

/**
 * Create barcodes section for the side panel
 * @param {React.ComponentType} PanelComponent - The panel component to render
 * @param {object|function} panelProps - Props object or factory function that returns props
 */
export function createBarcodesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'barcodes',
    Tab: (props) => React.createElement(SectionTab, { name: 'Barcodes', ...props },
      React.createElement(BarcodeIcon)),
    Panel: ({ store }) => {
      const resolvedProps = typeof panelProps === 'function' ? panelProps() : panelProps;
      return React.createElement(PanelComponent, { store, ...resolvedProps });
    },
  };
}

/**
 * Create project images section for the side panel
 * @param {React.ComponentType} PanelComponent - The panel component to render
 * @param {object|function} panelProps - Props object or factory function that returns props
 */
export function createProjectImagesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'project-images',
    Tab: (props) => React.createElement(SectionTab, { name: 'Images', ...props },
      React.createElement(ImageIcon)),
    Panel: ({ store }) => {
      const resolvedProps = typeof panelProps === 'function' ? panelProps() : panelProps;
      return React.createElement(PanelComponent, { store, ...resolvedProps });
    },
  };
}

/**
 * Create sequence section for the side panel
 * @param {React.ComponentType} PanelComponent - The panel component to render
 * @param {object|function} panelProps - Props object or factory function that returns props
 */
export function createSequenceSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'sequence',
    Tab: (props) => React.createElement(SectionTab, { name: 'Sequence', ...props },
      React.createElement(SequenceIcon)),
    Panel: ({ store }) => {
      const resolvedProps = typeof panelProps === 'function' ? panelProps() : panelProps;
      return React.createElement(PanelComponent, { store, ...resolvedProps });
    },
  };
}

/**
 * Build complete sections array with custom VDP sections + filtered defaults
 */
export function buildCustomSections(customSections) {
  const { DEFAULT_SECTIONS } = getPolotnoComponents();
  
  // Keep only useful default sections
  const filteredDefaults = DEFAULT_SECTIONS.filter(
    section => ['text', 'photos', 'elements', 'upload', 'background', 'layers'].includes(section.name)
  );
  
  return [...customSections, ...filteredDefaults];
}
