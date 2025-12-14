import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ImageAssetUpload, UploadedImage } from '@/components/ImageAssetUpload';
import { validateImageReferences, ImageValidationResult } from '@/lib/image-validation-utils';
import { ArrowLeft, ArrowRight, CheckCircle, AlertTriangle, Image, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageUploadStepProps {
  projectId: string;
  workspaceId: string;
  imageColumns: string[];
  dataRows: Record<string, any>[];
  onComplete: (uploadedImages: UploadedImage[]) => void;
  onBack: () => void;
}

export function ImageUploadStep({
  projectId,
  workspaceId,
  imageColumns,
  dataRows,
  onComplete,
  onBack,
}: ImageUploadStepProps) {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [showMissing, setShowMissing] = useState(false);

  // Get sample image references from data for each image column
  const sampleReferences = useMemo(() => {
    const samples: Record<string, string[]> = {};
    for (const col of imageColumns) {
      const values = dataRows
        .map(row => row[col])
        .filter(v => v && typeof v === 'string' && v.trim())
        .slice(0, 5) as string[];
      samples[col] = values;
    }
    return samples;
  }, [imageColumns, dataRows]);

  // Count unique image references across all image columns
  const uniqueReferences = useMemo(() => {
    const refs = new Set<string>();
    for (const col of imageColumns) {
      for (const row of dataRows) {
        const val = row[col];
        if (val && typeof val === 'string' && val.trim()) {
          refs.add(val.trim());
        }
      }
    }
    return refs;
  }, [imageColumns, dataRows]);

  // Validate images against the first image column (primary)
  const validation: ImageValidationResult = useMemo(() => {
    if (imageColumns.length === 0) {
      return { valid: true, matched: 0, missing: [], total: 0, matchRate: 100 };
    }
    // Validate against all image columns combined
    const allValidations: ImageValidationResult[] = imageColumns.map(col => 
      validateImageReferences(dataRows, col, uploadedImages)
    );
    
    // Merge validations
    const allMissing = new Set<string>();
    let totalMatched = 0;
    let totalRefs = 0;
    
    for (const v of allValidations) {
      v.missing.forEach(m => allMissing.add(m));
      totalMatched += v.matched;
      totalRefs += v.total;
    }
    
    const missing = Array.from(allMissing);
    const matchRate = totalRefs > 0 ? Math.round(((totalRefs - missing.length) / totalRefs) * 100) : 100;
    
    return {
      valid: missing.length === 0,
      matched: totalRefs - missing.length,
      missing,
      total: totalRefs,
      matchRate,
    };
  }, [imageColumns, dataRows, uploadedImages]);

  const canContinue = validation.valid;

  const handleImagesChange = (images: UploadedImage[]) => {
    setUploadedImages(images);
  };

  const handleContinue = () => {
    onComplete(uploadedImages);
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Image className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Upload Your Images</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          We detected {uniqueReferences.size} image reference{uniqueReferences.size !== 1 ? 's' : ''} in your data. 
          Upload the matching images so they appear in your final output.
        </p>
      </div>

      {/* Show detected image columns and samples */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Image className="h-4 w-4" />
            Detected Image References
          </CardTitle>
          <CardDescription className="text-xs">
            These columns contain file path or image references
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {imageColumns.map(col => (
            <div key={col} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{col}</Badge>
                <span className="text-xs text-muted-foreground">
                  ({sampleReferences[col]?.length || 0} sample{sampleReferences[col]?.length !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {sampleReferences[col]?.slice(0, 3).map((val, i) => {
                  // Extract just filename from path
                  const filename = val.includes('\\') 
                    ? val.split('\\').pop() 
                    : val.includes('/') 
                      ? val.split('/').pop() 
                      : val;
                  return (
                    <code key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]" title={val}>
                      {filename}
                    </code>
                  );
                })}
                {(sampleReferences[col]?.length || 0) > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{(sampleReferences[col]?.length || 0) - 3} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Validation Status */}
      {uploadedImages.length > 0 && (
        <Alert className={cn(
          validation.valid 
            ? "border-green-500 bg-green-50 dark:bg-green-950" 
            : "border-amber-500 bg-amber-50 dark:bg-amber-950"
        )}>
          {validation.valid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <AlertTitle className="flex items-center gap-2">
            {validation.valid ? 'All Images Matched!' : 'Some Images Missing'}
            <Badge variant={validation.valid ? 'default' : 'outline'} className="ml-2">
              {validation.matched}/{validation.total} matched
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-2">
            {validation.valid ? (
              <p className="text-sm">
                All image references in your data have matching uploaded images.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {validation.missing.length} image{validation.missing.length !== 1 ? 's are' : ' is'} referenced 
                  in your data but not yet uploaded.
                </p>
                
                <Progress value={validation.matchRate} className="h-2" />
                
                <Collapsible open={showMissing} onOpenChange={setShowMissing}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 h-auto text-amber-700 hover:text-amber-800">
                      <ChevronDown className={cn("h-4 w-4 mr-1 transition-transform", showMissing && "rotate-180")} />
                      {showMissing ? 'Hide' : 'Show'} missing images
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-background/50 rounded border">
                      {validation.missing.map((name, i) => {
                        const filename = name.includes('\\') 
                          ? name.split('\\').pop() 
                          : name.includes('/') 
                            ? name.split('/').pop() 
                            : name;
                        return (
                          <Badge key={i} variant="destructive" className="text-xs">
                            {filename}
                          </Badge>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Upload Images</CardTitle>
          <CardDescription className="text-xs">
            Drag & drop images or ZIP files. Image filenames should match the values in your data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImageAssetUpload
            projectId={projectId}
            workspaceId={workspaceId}
            onImagesChange={handleImagesChange}
          />
        </CardContent>
      </Card>


      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <Button 
          onClick={handleContinue}
          disabled={!canContinue}
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
