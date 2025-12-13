import { AlertTriangle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { ImageValidationResult } from '@/lib/image-validation-utils';

interface ImageValidationWarningProps {
  validation: ImageValidationResult;
  imageColumn: string;
  onUploadClick?: () => void;
}

export function ImageValidationWarning({ 
  validation, 
  imageColumn,
  onUploadClick 
}: ImageValidationWarningProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (validation.valid) {
    return (
      <Alert className="border-green-500/50 bg-green-500/10">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-700">All images found</AlertTitle>
        <AlertDescription className="text-green-600">
          All {validation.total} image references in "{imageColumn}" have matching uploaded images.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="flex items-center gap-2 text-amber-700">
        Missing Images
        <Badge variant="outline" className="text-amber-600 border-amber-500/50">
          {validation.missing.length} of {validation.total}
        </Badge>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-amber-600">
          {validation.missing.length} image{validation.missing.length > 1 ? 's' : ''} referenced in 
          "{imageColumn}" column {validation.missing.length > 1 ? 'are' : 'is'} not uploaded. 
          These will appear as placeholders in the generated PDF.
        </p>
        
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-800 p-0 h-auto">
              {isOpen ? 'Hide' : 'Show'} missing images
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="bg-background/50 rounded-md p-3 max-h-32 overflow-y-auto">
              <ul className="space-y-1">
                {validation.missing.map((name, i) => (
                  <li key={i} className="text-sm flex items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-3 w-3" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {onUploadClick && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onUploadClick}
            className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
          >
            Upload Missing Images
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
