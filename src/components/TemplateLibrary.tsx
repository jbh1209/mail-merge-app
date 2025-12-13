import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, CheckCircle2, Package, FileText, Tag, ExternalLink, PlusCircle, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useRegionPreference } from "@/hooks/useRegionPreference";
import { CustomLabelSizeDialog } from "@/components/CustomLabelSizeDialog";
import { STANDARD_SIZES, LabelSize, PROJECT_TYPE_KEYWORDS, getSuggestedTemplates } from "@/lib/avery-labels";

interface TemplateLibraryProps {
  onSelect: (template: LabelSize) => void;
  selectedId?: string;
  /** Optional project type to filter/prioritize templates */
  projectType?: string;
}

export function TemplateLibrary({ onSelect, selectedId, projectType }: TemplateLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCustomSize, setShowCustomSize] = useState(false);
  const { formatDimensions } = useRegionPreference();

  // Get keywords for current project type to highlight relevant templates
  const projectKeywords = projectType ? PROJECT_TYPE_KEYWORDS[projectType] || [] : [];

  const { data: dbTemplates, isLoading } = useQuery({
    queryKey: ['label-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('label_templates')
        .select('*')
        .order('part_number');
      
      if (error) throw error;
      return data;
    }
  });

  const filterDbTemplates = () => {
    if (!dbTemplates) return [];
    
    let filtered = dbTemplates;
    
    // Apply project type filtering first (prioritize, don't exclude)
    if (projectType && projectKeywords.length > 0) {
      filtered = filtered.sort((a, b) => {
        const aMatch = projectKeywords.some(kw => 
          a.description?.toLowerCase().includes(kw) || 
          a.categories?.some(c => c.toLowerCase().includes(kw))
        ) ? 1 : 0;
        const bMatch = projectKeywords.some(kw => 
          b.description?.toLowerCase().includes(kw) || 
          b.categories?.some(c => c.toLowerCase().includes(kw))
        ) ? 1 : 0;
        return bMatch - aMatch;
      });
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.part_number.toLowerCase().includes(query) ||
          t.brand.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.categories?.some(c => c.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  };

  const filterStandardSizes = () => {
    // Get suggested templates for project type, or all if no type
    let templates = projectType ? getSuggestedTemplates(projectType) : STANDARD_SIZES;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.useCase?.toLowerCase().includes(query)
      );
    }
    
    return templates;
  };

  const handleDbTemplateSelect = (template: typeof dbTemplates[0]) => {
    onSelect({
      id: template.id,
      name: `${template.brand} ${template.part_number}`,
      width_mm: template.label_width_mm,
      height_mm: template.label_height_mm,
      labelsPerSheet: template.labels_per_sheet ?? undefined,
      averyCode: template.part_number,
      description: template.description ?? undefined,
      useCase: template.categories?.join(", "),
      category: "avery",
    });
  };

  const handleCustomSizeSubmit = (size: { width_mm: number; height_mm: number; labelsPerSheet?: number; paperSize: string }) => {
    onSelect({
      id: `custom-${Date.now()}`,
      name: "Custom Size",
      width_mm: size.width_mm,
      height_mm: size.height_mm,
      labelsPerSheet: size.labelsPerSheet,
      description: `${size.paperSize} sheet`,
      category: "custom",
    });
  };

  const DbTemplateCard = ({ template }: { template: typeof dbTemplates[0] }) => {
    const isSelected = selectedId === template.id;
    
    return (
      <Card 
        className={`cursor-pointer transition-all hover:shadow-md ${
          isSelected ? "ring-2 ring-primary" : ""
        }`}
        onClick={() => handleDbTemplateSelect(template)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {template.brand} {template.part_number}
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {template.region} • {template.paper_size}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
            <Badge variant="outline" className="font-mono">
              {formatDimensions(template.label_width_mm, template.label_height_mm)}
            </Badge>
            {template.labels_per_sheet && (
              <Badge variant="secondary">
                {template.labels_per_sheet} per sheet
              </Badge>
            )}
            <Badge variant="outline">
              {template.columns}×{template.rows}
            </Badge>
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
          )}
          {template.categories && template.categories.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              <span className="truncate">{template.categories.slice(0, 2).join(", ")}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const StandardTemplateCard = ({ template }: { template: LabelSize }) => {
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {formatDimensions(template.width_mm, template.height_mm)}
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
        </CardContent>
      </Card>
    );
  };

  const NoResultsPanel = () => (
    <div className="text-center py-8 space-y-4 border rounded-lg bg-muted/30">
      <p className="text-muted-foreground">
        No templates found matching "<span className="font-medium">{searchQuery}</span>"
      </p>
      
      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        <Button variant="outline" asChild>
          <a 
            href={`https://www.avery.com/templates/${searchQuery}`} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Look up "{searchQuery}" on Avery.com
          </a>
        </Button>
        
        <Button variant="secondary" onClick={() => setShowCustomSize(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Enter Custom Dimensions
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground mt-4">
        Find the label dimensions on the packaging or Avery's website, then enter them manually.
      </p>
    </div>
  );

  const filteredDbTemplates = filterDbTemplates();
  const filteredStandardSizes = filterStandardSizes();

  return (
    <div className="space-y-4">
      {/* Prominent Custom Size Button */}
      <Card 
        className="cursor-pointer border-dashed border-2 hover:border-primary hover:bg-primary/5 transition-colors"
        onClick={() => setShowCustomSize(true)}
      >
        <CardContent className="flex items-center justify-center gap-3 py-4">
          <div className="p-2 rounded-full bg-primary/10">
            <PlusCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-medium">Create Custom Size</p>
            <p className="text-sm text-muted-foreground">Enter your own dimensions</p>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by part number, brand, or use case..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Project type hint */}
      {projectType && projectKeywords.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Showing templates recommended for <strong className="text-foreground">{projectType.replace('_', ' ')}</strong> projects</span>
        </div>
      )}

      <Tabs defaultValue="avery" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="avery" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Label Templates {dbTemplates && `(${dbTemplates.length})`}
          </TabsTrigger>
          <TabsTrigger value="standard" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Standard Sizes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="avery" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDbTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDbTemplates.map((template) => (
                <DbTemplateCard key={template.id} template={template} />
              ))}
            </div>
          ) : searchQuery ? (
            <NoResultsPanel />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No templates available
            </div>
          )}
        </TabsContent>

        <TabsContent value="standard" className="space-y-4 mt-4">
          {filteredStandardSizes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStandardSizes.map((template) => (
                <StandardTemplateCard key={template.id} template={template} />
              ))}
            </div>
          ) : (
            <NoResultsPanel />
          )}
        </TabsContent>
      </Tabs>

      <CustomLabelSizeDialog
        open={showCustomSize}
        onOpenChange={setShowCustomSize}
        onSubmit={handleCustomSizeSubmit}
        initialPartNumber={searchQuery || undefined}
      />
    </div>
  );
}
