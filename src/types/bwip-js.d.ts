declare module 'bwip-js' {
  export interface BWIPJSOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    textxalign?: string;
    textsize?: number;
    [key: string]: any;
  }

  export function toCanvas(canvas: HTMLCanvasElement, options: BWIPJSOptions): void;
  export function toSVG(options: BWIPJSOptions): string;
  
  const bwipjs: {
    toCanvas: typeof toCanvas;
    toSVG: typeof toSVG;
  };
  
  export default bwipjs;
}
