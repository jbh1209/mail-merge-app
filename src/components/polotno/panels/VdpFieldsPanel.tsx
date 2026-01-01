/* eslint-disable @typescript-eslint/no-explicit-any */
import { Type, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { isLikelyImageField } from '@/lib/avery-labels';

interface VdpFieldsPanelProps {
  store: any;
  availableFields: string[];
  projectImages?: { name: string; url: string }[];
}

export function VdpFieldsPanel({ store, availableFields, projectImages = [] }: VdpFieldsPanelProps) {
  const textFields = availableFields.filter(f => !isLikelyImageField(f));
  const imageFields = availableFields.filter(f => isLikelyImageField(f));

  const handleInsertTextField = (fieldName: string) => {
    const page = store.activePage;
    if (!page) return;

    page.addElement({
      type: 'text',
      x: page.width / 2 - 100,
      y: page.height / 2 - 20,
      width: 200,
      height: 40,
      text: `{{${fieldName}}}`,
      fontSize: 24,
      fontFamily: 'Roboto',
      align: 'center',
      custom: {
        variable: fieldName,
      },
    });
  };

  const handleInsertImageField = (fieldName: string, imageUrl?: string) => {
    const page = store.activePage;
    if (!page) return;

    page.addElement({
      type: 'image',
      x: page.width / 2 - 50,
      y: page.height / 2 - 50,
      width: 100,
      height: 100,
      src: imageUrl || 'https://via.placeholder.com/100',
      custom: {
        variable: fieldName,
      },
    });
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Variable Data Fields</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Click a field to insert it as a placeholder.
      </p>
      
      <ScrollArea className="h-[calc(100vh-300px)]">
        {textFields.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Type className="h-3 w-3" />
              Text Fields
            </h4>
            <div className="flex flex-wrap gap-2">
              {textFields.map((field) => (
                <Button
                  key={field}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleInsertTextField(field)}
                >
                  {field}
                </Button>
              ))}
            </div>
          </div>
        )}

        {imageFields.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Image className="h-3 w-3" />
              Image Fields
            </h4>
            <div className="flex flex-wrap gap-2">
              {imageFields.map((field) => {
                const matchedImage = projectImages.find(img => 
                  img.name.toLowerCase().includes(field.toLowerCase()) ||
                  field.toLowerCase().includes(img.name.split('.')[0].toLowerCase())
                );
                return (
                  <Button
                    key={field}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleInsertImageField(field, matchedImage?.url)}
                  >
                    {field}
                    {matchedImage && <Badge variant="secondary" className="ml-1 text-[10px] px-1">linked</Badge>}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {availableFields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No data fields available. Upload a data source first.
          </p>
        )}
      </ScrollArea>
    </div>
  );
}
