import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Image, AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ImageConfigPanelProps {
  blockName: string;
  availableFields: string[];
  projectImages: { name: string; url: string }[];
  sampleData: Record<string, string>;
  onFieldChange: (fieldName: string) => void;
}

export function ImageConfigPanel({
  blockName,
  availableFields,
  projectImages,
  sampleData,
  onFieldChange,
}: ImageConfigPanelProps) {
  // Parse current field from block name
  const currentField = blockName.replace('vdp:image:', '') || '';
  const [selectedField, setSelectedField] = useState(currentField);
  
  // Check if selected field has matching images
  const sampleValue = sampleData[selectedField] || '';
  const hasMatchingImage = sampleValue && projectImages.some(img => {
    const imgName = img.name.toLowerCase().replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
    const value = sampleValue.toString().toLowerCase();
    return imgName.includes(value) || value.includes(imgName);
  });

  // Filter to likely image fields
  const imageFields = availableFields.filter(field => {
    const lower = field.toLowerCase();
    return lower.includes('image') || 
           lower.includes('photo') || 
           lower.includes('picture') || 
           lower.includes('logo') || 
           lower.includes('avatar') || 
           lower.includes('headshot') ||
           lower.includes('thumbnail') ||
           lower.includes('icon') ||
           lower.includes('img');
  });

  // Show all fields if no image-specific fields detected
  const fieldsToShow = imageFields.length > 0 ? imageFields : availableFields;

  const handleFieldChange = (value: string) => {
    setSelectedField(value);
    onFieldChange(value);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Image className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Variable Image Configuration</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="image-field">Data Field</Label>
        <Select value={selectedField} onValueChange={handleFieldChange}>
          <SelectTrigger id="image-field">
            <SelectValue placeholder="Select image field" />
          </SelectTrigger>
          <SelectContent>
            {fieldsToShow.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Image filenames in your assets should match values in this column
        </p>
      </div>

      {selectedField && (
        <div className="space-y-2">
          <Label>Sample Value</Label>
          <div className="flex items-center gap-2">
            <Input 
              value={sampleValue} 
              readOnly 
              className="bg-muted text-sm"
            />
            {hasMatchingImage ? (
              <Badge variant="default" className="gap-1 shrink-0">
                <Check className="h-3 w-3" />
                Found
              </Badge>
            ) : sampleValue ? (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <AlertCircle className="h-3 w-3" />
                Missing
              </Badge>
            ) : null}
          </div>
        </div>
      )}

      {selectedField && sampleValue && !hasMatchingImage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No image found matching "{sampleValue}". Upload an image with this filename to the Assets tab.
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-muted-foreground border-t pt-3">
        <strong>How it works:</strong>
        <ul className="mt-1 space-y-1 list-disc list-inside">
          <li>Each row in your data contains a value like "product-001.jpg"</li>
          <li>Upload images with matching filenames to the Assets tab</li>
          <li>During PDF generation, each record gets its unique image</li>
        </ul>
      </div>
    </div>
  );
}

export default ImageConfigPanel;