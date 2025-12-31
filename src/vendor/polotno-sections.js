/**
 * Polotno Custom Sections Builder
 * 
 * This file is plain JavaScript to avoid TypeScript processing Polotno types.
 * It builds custom section definitions that use our React panel components.
 */

import React from 'react';
import { Type, QrCode, Image, Hash } from 'lucide-react';
import { getPolotnoComponents } from './polotno-runtime.js';

// Inject custom CSS for Polotno sidebar tab styling
const injectTabStyles = () => {
  const styleId = 'polotno-custom-tab-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Custom styles for Polotno sidebar tabs to center our icons */
    .polotno-side-panel [role="tab"] {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 8px 4px !important;
    }
    .polotno-side-panel [role="tab"] svg {
      width: 20px !important;
      height: 20px !important;
    }
  `;
  document.head.appendChild(style);
};

/**
 * Create VDP fields section for the side panel
 */
export function createVdpFieldsSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  injectTabStyles();
  
  return {
    name: 'vdp-fields',
    Tab: (props) => React.createElement(SectionTab, { name: 'Data Fields', ...props },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(Type, { size: 20 }))),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create barcodes section for the side panel
 */
export function createBarcodesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  injectTabStyles();
  
  return {
    name: 'barcodes',
    Tab: (props) => React.createElement(SectionTab, { name: 'Barcodes', ...props },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(QrCode, { size: 20 }))),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create project images section for the side panel
 */
export function createProjectImagesSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  injectTabStyles();
  
  return {
    name: 'project-images',
    Tab: (props) => React.createElement(SectionTab, { name: 'Images', ...props },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(Image, { size: 20 }))),
    Panel: () => React.createElement(PanelComponent, panelProps),
  };
}

/**
 * Create sequence section for the side panel
 */
export function createSequenceSection(PanelComponent, panelProps) {
  const { SectionTab } = getPolotnoComponents();
  injectTabStyles();
  
  return {
    name: 'sequence',
    Tab: (props) => React.createElement(SectionTab, { name: 'Sequence', ...props },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(Hash, { size: 20 }))),
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
