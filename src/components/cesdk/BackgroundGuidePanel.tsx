import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Upload, Image, X } from 'lucide-react';

interface BackgroundGuidePanelProps {
  open: boolean;
  onClose: () => void;
  onAddBackground: (file: File) => void;
  templateType?: string;
}

const getContextualContent = (templateType?: string) => {
  const content: Record<string, { title: string; description: string; tips: string[] }> = {
    badge: {
      title: "Add Badge Background",
      description: "Upload your badge design or lanyard graphic to complete your event badges.",
      tips: [
        "Use your event branding or logo",
        "Consider portrait orientation for lanyards",
        "High contrast helps text readability",
        "Use high-resolution images for best print quality",
      ]
    },
    certificate: {
      title: "Add Certificate Background",
      description: "Upload an ornate border, watermark, or official design for your certificates.",
      tips: [
        "Classic borders add a professional touch",
        "Subtle watermarks work well behind text",
        "Use your organization's letterhead design",
        "High-resolution ensures crisp printing",
      ]
    },
    card: {
      title: "Add Card Background",
      description: "Upload your business card design or creative background.",
      tips: [
        "Consider double-sided designs",
        "Brand colours improve recognition",
        "Leave space for contact details",
        "Use high-resolution for print quality",
      ]
    },
    label: {
      title: "Add Label Background",
      description: "Upload product branding, patterns, or label designs.",
      tips: [
        "Keep important areas clear for variable data",
        "Use high-resolution images for product labels",
        "Consider barcode placement zones",
        "Match your product's colour scheme",
      ]
    },
    shelf_strip: {
      title: "Add Shelf Strip Background",
      description: "Upload store branding or promotional backgrounds.",
      tips: [
        "Match your store's colour scheme",
        "Keep price areas high contrast",
        "Consider promotional seasonal themes",
        "Use consistent branding elements",
      ]
    },
    custom: {
      title: "Add Background Image",
      description: "Upload a background image to complete your design.",
      tips: [
        "The image will fill the entire page",
        "Double-click to adjust crop",
        "Use high-resolution for print quality",
        "It will be placed behind all other elements",
      ]
    }
  };
  return content[templateType || 'custom'] || content.custom;
};

export function BackgroundGuidePanel({ open, onClose, onAddBackground, templateType }: BackgroundGuidePanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const content = getContextualContent(templateType);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      setIsUploading(true);
      onAddBackground(files[0]);
      setTimeout(() => {
        setIsUploading(false);
        onClose();
      }, 500);
    }
  }, [onAddBackground, onClose]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsUploading(true);
      onAddBackground(files[0]);
      setTimeout(() => {
        setIsUploading(false);
        onClose();
      }, 500);
    }
  }, [onAddBackground, onClose]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-[350px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            {content.title}
          </SheetTitle>
          <SheetDescription>
            Your data fields are ready! {content.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Drag and drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
              }
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            <Upload className={`mx-auto h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm font-medium">
              {isDragging ? 'Drop image here' : 'Drag & drop your background image'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
            
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
          </div>

          {/* Tips */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Tips:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {content.tips.map((tip, index) => (
                <li key={index}>• {tip}</li>
              ))}
            </ul>
          </div>

          {/* Skip button */}
          <Button 
            variant="ghost" 
            className="w-full" 
            onClick={onClose}
          >
            <X className="h-4 w-4 mr-2" />
            Skip for now
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
