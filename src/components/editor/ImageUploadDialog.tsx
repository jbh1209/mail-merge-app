// ============================================================================
// IMAGE UPLOAD DIALOG - Upload images with DPI validation
// ============================================================================

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Upload, AlertTriangle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import type { DesignElement, ImageConfig } from '@/lib/editor/types';

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageAdd: (element: DesignElement) => void;
  pageSize: { width: number; height: number };
  targetWidthMm?: number;  // If provided, calculate DPI for this width
  targetHeightMm?: number; // If provided, calculate DPI for this height
}

interface ImageAnalysis {
  file: File;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  aspectRatio: number;
  estimatedDpi: number;
  dpiWarning: 'low' | 'acceptable' | 'good' | 'excellent';
}

// DPI thresholds for print quality
const DPI_THRESHOLDS = {
  minimum: 150,    // Minimum for any print
  acceptable: 200, // Acceptable for most print
  good: 300,       // Standard print quality
  excellent: 400   // High-quality print
};

function getDpiWarning(dpi: number): ImageAnalysis['dpiWarning'] {
  if (dpi < DPI_THRESHOLDS.minimum) return 'low';
  if (dpi < DPI_THRESHOLDS.acceptable) return 'acceptable';
  if (dpi < DPI_THRESHOLDS.good) return 'good';
  return 'excellent';
}

function getDpiWarningColor(warning: ImageAnalysis['dpiWarning']): string {
  switch (warning) {
    case 'low': return 'destructive';
    case 'acceptable': return 'warning';
    case 'good': return 'secondary';
    case 'excellent': return 'default';
  }
}

function getDpiWarningText(warning: ImageAnalysis['dpiWarning']): string {
  switch (warning) {
    case 'low': return 'Low resolution - may appear pixelated in print';
    case 'acceptable': return 'Acceptable for most print applications';
    case 'good': return 'Good quality for standard print';
    case 'excellent': return 'Excellent quality for high-end print';
  }
}

export function ImageUploadDialog({
  open,
  onOpenChange,
  onImageAdd,
  pageSize,
  targetWidthMm,
  targetHeightMm
}: ImageUploadDialogProps) {
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customWidthMm, setCustomWidthMm] = useState<number>(20);
  const [customHeightMm, setCustomHeightMm] = useState<number>(20);
  
  // Calculate DPI based on target print dimensions
  const calculateDpi = useCallback((widthPx: number, heightPx: number, widthMm: number, heightMm: number): number => {
    const widthInches = widthMm / 25.4;
    const heightInches = heightMm / 25.4;
    const dpiFromWidth = widthPx / widthInches;
    const dpiFromHeight = heightPx / heightInches;
    // Use the lower DPI (limiting factor)
    return Math.min(dpiFromWidth, dpiFromHeight);
  }, []);
  
  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = dataUrl;
      });
      
      const widthPx = img.naturalWidth;
      const heightPx = img.naturalHeight;
      const aspectRatio = widthPx / heightPx;
      
      // Calculate initial dimensions maintaining aspect ratio
      let initialWidthMm = targetWidthMm || 20;
      let initialHeightMm = targetHeightMm || (initialWidthMm / aspectRatio);
      
      // Constrain to page size
      if (initialWidthMm > pageSize.width * 0.8) {
        initialWidthMm = pageSize.width * 0.8;
        initialHeightMm = initialWidthMm / aspectRatio;
      }
      if (initialHeightMm > pageSize.height * 0.8) {
        initialHeightMm = pageSize.height * 0.8;
        initialWidthMm = initialHeightMm * aspectRatio;
      }
      
      setCustomWidthMm(Math.round(initialWidthMm * 10) / 10);
      setCustomHeightMm(Math.round(initialHeightMm * 10) / 10);
      
      const estimatedDpi = calculateDpi(widthPx, heightPx, initialWidthMm, initialHeightMm);
      
      setAnalysis({
        file,
        dataUrl,
        widthPx,
        heightPx,
        aspectRatio,
        estimatedDpi,
        dpiWarning: getDpiWarning(estimatedDpi)
      });
    } catch (error) {
      console.error('Error loading image:', error);
    } finally {
      setIsLoading(false);
    }
  }, [targetWidthMm, targetHeightMm, pageSize, calculateDpi]);
  
  // Update DPI when dimensions change
  const handleWidthChange = useCallback((width: number) => {
    setCustomWidthMm(width);
    if (analysis) {
      const newHeight = width / analysis.aspectRatio;
      setCustomHeightMm(Math.round(newHeight * 10) / 10);
      const newDpi = calculateDpi(analysis.widthPx, analysis.heightPx, width, newHeight);
      setAnalysis(prev => prev ? {
        ...prev,
        estimatedDpi: newDpi,
        dpiWarning: getDpiWarning(newDpi)
      } : null);
    }
  }, [analysis, calculateDpi]);
  
  const handleHeightChange = useCallback((height: number) => {
    setCustomHeightMm(height);
    if (analysis) {
      const newWidth = height * analysis.aspectRatio;
      setCustomWidthMm(Math.round(newWidth * 10) / 10);
      const newDpi = calculateDpi(analysis.widthPx, analysis.heightPx, newWidth, height);
      setAnalysis(prev => prev ? {
        ...prev,
        estimatedDpi: newDpi,
        dpiWarning: getDpiWarning(newDpi)
      } : null);
    }
  }, [analysis, calculateDpi]);
  
  // Add the image to the canvas
  const handleAddImage = useCallback(() => {
    if (!analysis) return;
    
    const element: DesignElement = {
      id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      kind: 'image',
      name: analysis.file.name.replace(/\.[^/.]+$/, ''),
      x: (pageSize.width - customWidthMm) / 2,
      y: (pageSize.height - customHeightMm) / 2,
      width: customWidthMm,
      height: customHeightMm,
      zIndex: 100,
      locked: false,
      visible: true,
      style: {
        opacity: 1,
        fit: 'contain'
      },
      config: {
        src: analysis.dataUrl,
        originalWidth: analysis.widthPx,
        originalHeight: analysis.heightPx
      } as ImageConfig
    };
    
    onImageAdd(element);
    onOpenChange(false);
    setAnalysis(null);
  }, [analysis, customWidthMm, customHeightMm, pageSize, onImageAdd, onOpenChange]);
  
  const handleClose = useCallback(() => {
    onOpenChange(false);
    setAnalysis(null);
  }, [onOpenChange]);
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Add Image
          </DialogTitle>
          <DialogDescription>
            Upload an image and configure its size. DPI is calculated based on print dimensions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Upload */}
          {!analysis && (
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="image-upload"
                disabled={isLoading}
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Click to upload image</span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, GIF, SVG, WebP
                </span>
              </label>
            </div>
          )}
          
          {/* Image Preview & Analysis */}
          {analysis && (
            <>
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                  <img
                    src={analysis.dataUrl}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                
                {/* Info */}
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium truncate">{analysis.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Original: {analysis.widthPx} × {analysis.heightPx} px
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Size: {(analysis.file.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={getDpiWarningColor(analysis.dpiWarning) as any}>
                      {Math.round(analysis.estimatedDpi)} DPI
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* DPI Warning */}
              <Alert variant={analysis.dpiWarning === 'low' ? 'destructive' : 'default'}>
                {analysis.dpiWarning === 'low' || analysis.dpiWarning === 'acceptable' ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <AlertDescription className="text-xs">
                  {getDpiWarningText(analysis.dpiWarning)}
                  {analysis.dpiWarning === 'low' && (
                    <span className="block mt-1">
                      Consider reducing the print size or using a higher resolution image.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
              
              {/* Size Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Width (mm)</Label>
                  <Input
                    type="number"
                    value={customWidthMm}
                    onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 10)}
                    min={5}
                    max={pageSize.width}
                    step={0.5}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Height (mm)</Label>
                  <Input
                    type="number"
                    value={customHeightMm}
                    onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 10)}
                    min={5}
                    max={pageSize.height}
                    step={0.5}
                    className="h-9"
                  />
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Aspect ratio is maintained when adjusting dimensions.
                For best print quality, aim for 300+ DPI.
              </p>
            </>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {analysis && (
            <Button onClick={handleAddImage}>
              Add to Canvas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}