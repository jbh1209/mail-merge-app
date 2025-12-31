/* eslint-disable @typescript-eslint/no-explicit-any */
import { Image, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProjectImagesPanelProps {
  store: any;
  projectImages: { name: string; url: string }[];
  onUploadRequest?: () => void;
}

export function ProjectImagesPanel({ store, projectImages, onUploadRequest }: ProjectImagesPanelProps) {
  const handleInsertImage = (imageUrl: string, imageName: string) => {
    const page = store.activePage;
    if (!page) return;

    page.addElement({
      type: 'image',
      x: page.width / 2 - 50,
      y: page.height / 2 - 50,
      width: 100,
      height: 100,
      src: imageUrl,
      custom: {
        projectImage: imageName,
      },
    });
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Project Images</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Click to add to canvas.
      </p>
      
      <ScrollArea className="h-[calc(100vh-350px)]">
        {projectImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {projectImages.map((img) => (
              <button
                key={img.name}
                onClick={() => handleInsertImage(img.url, img.name)}
                className="relative aspect-square rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all group"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium px-2 text-center truncate">
                    {img.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Image className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No images uploaded yet
            </p>
            {onUploadRequest && (
              <Button variant="outline" size="sm" onClick={onUploadRequest}>
                <Upload className="h-4 w-4 mr-1" />
                Upload Images
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
