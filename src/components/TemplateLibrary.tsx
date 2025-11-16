import { useState } from "react";
import { Search, CheckCircle2, Package, FileText, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AVERY_LABELS, STANDARD_SIZES, LabelSize } from "@/lib/avery-labels";

interface TemplateLibraryProps {
  onSelect: (template: LabelSize) => void;
  selectedId?: string;
}

export function TemplateLibrary({ onSelect, selectedId }: TemplateLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filterTemplates = (templates: LabelSize[]) => {
    if (!searchQuery) return templates;
    const query = searchQuery.toLowerCase();
    return templates.filter(
      t =>
        t.name.toLowerCase().includes(query) ||
        t.averyCode?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.useCase?.toLowerCase().includes(query)
    );
  };

  const TemplateCard = ({ template }: { template: LabelSize }) => {
    const isSelected = selectedId === template.id;
    
    return (
      <Card 
        className={`cursor-pointer transition-all hover:shadow-md ${
          isSelected ? "ring-2 ring-primary" : ""
        }`}
        onClick={() => onSelect(template)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {template.name}
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </CardTitle>
              {template.averyCode && (
                <CardDescription className="text-xs mt-1">
                  Avery {template.averyCode}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {template.width_mm}mm × {template.height_mm}mm
            </Badge>
            {template.labelsPerSheet && (
              <Badge variant="secondary">
                {template.labelsPerSheet} per sheet
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
          {template.useCase && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              <span>{template.useCase}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, Avery code, or use case..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="avery" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="avery" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Avery Labels
          </TabsTrigger>
          <TabsTrigger value="standard" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Standard Sizes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="avery" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filterTemplates(AVERY_LABELS).map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
          {filterTemplates(AVERY_LABELS).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No templates found matching "{searchQuery}"
            </div>
          )}
        </TabsContent>

        <TabsContent value="standard" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filterTemplates(STANDARD_SIZES).map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
          {filterTemplates(STANDARD_SIZES).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No templates found matching "{searchQuery}"
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
