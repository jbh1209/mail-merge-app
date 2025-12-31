/**
 * Polotno Custom Sections Builder
 * 
 * This file is plain JavaScript to avoid TypeScript processing Polotno types.
 * It builds custom section definitions that use our React panel components.
 */

import React from 'react';
import { Type, QrCode, Image, Hash } from 'lucide-react';
import { getPolotnoComponents } from './polotno-runtime.js';

/**
 * Create VDP fields section for the side panel
 */
export function createVdpFieldsSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'vdp-fields',
    Tab: (props) => React.createElement(SectionTab, { name: 'Data Fields', ...props },
      React.createElement(Type, { size: 16 })),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create barcodes section for the side panel
 */
export function createBarcodesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'barcodes',
    Tab: (props) => React.createElement(SectionTab, { name: 'Barcodes', ...props },
      React.createElement(QrCode, { size: 16 })),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create project images section for the side panel
 */
export function createProjectImagesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'project-images',
    Tab: (props) => React.createElement(SectionTab, { name: 'Images', ...props },
      React.createElement(Image, { size: 16 })),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create sequence section for the side panel
 */
export function createSequenceSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  
  return {
    name: 'sequence',
    Tab: (props) => React.createElement(SectionTab, { name: 'Sequence', ...props },
      React.createElement(Hash, { size: 16 })),
    Panel: () => React.createElement(PanelComponent, panelProps),
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
