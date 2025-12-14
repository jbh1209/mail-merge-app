import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Image, Trash2, AlertCircle, X, FolderArchive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';

export interface UploadedImage {
  name: string;
  url: string;
  path: string;
  size: number;
}

interface ImageAssetUploadProps {
  projectId: string;
  workspaceId: string;
  onImagesChange?: (images: UploadedImage[]) => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image

export function ImageAssetUpload({ projectId, workspaceId, onImagesChange }: ImageAssetUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const getStoragePath = (filename: string) => {
    return `${workspaceId}/${projectId}/images/${filename}`;
  };

  // Load existing images from storage on mount
  useEffect(() => {
    loadExistingImages();
  }, [projectId, workspaceId]);

  const loadExistingImages = async () => {
    setLoading(true);
    try {
      const folderPath = `${workspaceId}/${projectId}/images`;
      const { data: files, error } = await supabase.storage
        .from('project-assets')
        .list(folderPath);

      if (error) {
        console.error('Failed to load existing images:', error);
        setLoading(false);
        return;
      }

      if (files && files.length > 0) {
        const images: UploadedImage[] = files
          .filter(file => !file.name.startsWith('.') && /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name))
          .map(file => {
            const path = `${folderPath}/${file.name}`;
            const { data: urlData } = supabase.storage
              .from('project-assets')
              .getPublicUrl(path);

            return {
              name: file.name,
              url: urlData.publicUrl,
              path,
              size: file.metadata?.size || 0,
            };
          });

        setUploadedImages(images);
        onImagesChange?.(images);
      }
    } catch (err) {
      console.error('Error loading images:', err);
    }
    setLoading(false);
  };

  const uploadSingleImage = async (file: File): Promise<UploadedImage | null> => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.name}. Allowed: PNG, JPG, GIF, WebP`);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${file.name}. Maximum 10MB per image`);
    }

    const path = getStoragePath(file.name);
    
    const { error: uploadError } = await supabase.storage
      .from('project-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('project-assets')
      .getPublicUrl(path);

    return {
      name: file.name,
      url: urlData.publicUrl,
      path,
      size: file.size,
    };
  };

  const extractZipFile = async (zipFile: File): Promise<File[]> => {
    setExtracting(true);
    const extractedFiles: File[] = [];
    
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.entries(zip.files);
      
      for (const [filename, zipEntry] of entries) {
        // Skip directories and hidden files
        if (zipEntry.dir || filename.startsWith('__MACOSX') || filename.includes('/.')) {
          continue;
        }
        
        // Check if it's an allowed image type
        const ext = '.' + filename.split('.').pop()?.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          continue;
        }
        
        // Get just the filename without path
        const baseName = filename.split('/').pop() || filename;
        
        // Extract the file content
        const blob = await zipEntry.async('blob');
        const mimeType = ext === '.png' ? 'image/png' 
          : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
          : 'image/jpeg';
        
        const file = new File([blob], baseName, { type: mimeType });
        extractedFiles.push(file);
      }
      
      toast.success(`Extracted ${extractedFiles.length} images from ZIP`);
    } catch (err) {
      console.error('ZIP extraction error:', err);
      toast.error('Failed to extract ZIP file');
    }
    
    setExtracting(false);
    return extractedFiles;
  };

  const processFiles = async (files: File[]) => {
    setUploading(true);
    setProgress(0);
    setErrors([]);

    const newImages: UploadedImage[] = [];
    const newErrors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await uploadSingleImage(file);
        if (result) {
          newImages.push(result);
        }
      } catch (err) {
        newErrors.push(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploadedImages(prev => {
      // Merge and dedupe by name
      const merged = [...prev];
      for (const newImg of newImages) {
        const existingIdx = merged.findIndex(img => img.name === newImg.name);
        if (existingIdx >= 0) {
          merged[existingIdx] = newImg;
        } else {
          merged.push(newImg);
        }
      }
      onImagesChange?.(merged);
      return merged;
    });
    setErrors(newErrors);
    setUploading(false);

    if (newImages.length > 0) {
      toast.success(`Uploaded ${newImages.length} image${newImages.length > 1 ? 's' : ''}`);
    }
    if (newErrors.length > 0) {
      toast.error(`${newErrors.length} file${newErrors.length > 1 ? 's' : ''} failed to upload`);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    // Check for ZIP files
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const imageFiles = files.filter(f => !f.name.toLowerCase().endsWith('.zip'));

    // Extract ZIP files first
    for (const zipFile of zipFiles) {
      const extracted = await extractZipFile(zipFile);
      imageFiles.push(...extracted);
    }

    if (imageFiles.length > 0) {
      await processFiles(imageFiles);
    }
  }, [projectId, workspaceId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const zipFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const imageFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.zip'));

    // Extract ZIP files
    for (const zipFile of zipFiles) {
      const extracted = await extractZipFile(zipFile);
      imageFiles.push(...extracted);
    }

    if (imageFiles.length > 0) {
      await processFiles(imageFiles);
    }
    
    e.target.value = ''; // Reset input
  };

  const handleDelete = async (image: UploadedImage) => {
    try {
      const { error } = await supabase.storage
        .from('project-assets')
        .remove([image.path]);

      if (error) throw error;

      setUploadedImages(prev => {
        const updated = prev.filter(img => img.path !== image.path);
        onImagesChange?.(updated);
        return updated;
      });

      toast.success(`Deleted ${image.name}`);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(`Failed to delete ${image.name}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
          (uploading || extracting) && "pointer-events-none opacity-50"
        )}
      >
        <input
          type="file"
          id="image-upload"
          className="hidden"
          accept=".png,.jpg,.jpeg,.gif,.webp,.zip"
          multiple
          onChange={handleFileSelect}
          disabled={uploading || extracting}
        />
        
        <label htmlFor="image-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-3">
            {extracting ? (
              <>
                <FolderArchive className="h-10 w-10 text-primary animate-pulse" />
                <p className="text-sm text-muted-foreground">Extracting ZIP file...</p>
              </>
            ) : uploading ? (
              <>
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
                <Progress value={progress} className="w-48" />
              </>
            ) : (
              <>
                <div className="p-3 rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Drop images or ZIP files here, or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PNG, JPG, GIF, WebP, or ZIP archives • Up to 10MB per image
                  </p>
                </div>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                {errors.map((error, i) => (
                  <p key={i} className="text-sm text-destructive">{error}</p>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setErrors([])}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading existing images...</span>
        </div>
      )}

      {/* Uploaded Images Grid */}
      {!loading && uploadedImages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Uploaded Images ({uploadedImages.length})</h4>
            <Badge variant="outline" className="text-xs">
              {formatFileSize(uploadedImages.reduce((sum, img) => sum + img.size, 0))} total
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {uploadedImages.map((image) => (
              <Card key={image.path} className="group relative overflow-hidden">
                <div className="aspect-square bg-muted">
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(image)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-2 border-t">
                  <p className="text-xs font-medium truncate" title={image.name}>
                    {image.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(image.size)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && uploadedImages.length === 0 && !uploading && (
        <div className="text-center py-6 text-muted-foreground">
          <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No images uploaded yet</p>
          <p className="text-xs mt-1">
            Upload images that match your data field values for variable printing
          </p>
        </div>
      )}
    </div>
  );
}
