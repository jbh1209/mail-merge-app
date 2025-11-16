import { useState } from "react";
import { Upload, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TemplateUploadProps {
  projectId: string;
  workspaceId: string;
  onUploadComplete: () => void;
}

export function TemplateUpload({ projectId, workspaceId, onUploadComplete }: TemplateUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(selectedFile.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or image file (PNG, JPG)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (20MB max)
    if (selectedFile.size > 20 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 20MB",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    // Auto-fill template name from filename
    if (!templateName) {
      setTemplateName(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!file || !templateName.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a file and provide a template name",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${workspaceId}/${projectId}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("templates")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("templates")
        .getPublicUrl(fileName);

      // Determine template type
      const templateType = file.type === "application/pdf" 
        ? "uploaded_pdf" 
        : "uploaded_image";

      // Create template record
      const { error: insertError } = await supabase
        .from("templates")
        .insert({
          project_id: projectId,
          workspace_id: workspaceId,
          name: templateName,
          file_url: publicUrl,
          template_type: templateType,
          is_public: false
        });

      if (insertError) throw insertError;

      toast({
        title: "Template uploaded",
        description: "Your template has been uploaded successfully",
      });

      // Reset form
      setFile(null);
      setTemplateName("");
      onUploadComplete();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload template",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <div className="space-y-2">
          <Label htmlFor="template-file" className="cursor-pointer">
            <div className="text-sm text-muted-foreground">
              Click to upload or drag and drop
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              PDF, PNG, or JPG (max 20MB)
            </div>
          </Label>
          <Input
            id="template-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {file && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          {file.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-primary" />
          ) : (
            <ImageIcon className="h-8 w-8 text-primary" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="template-name">Template Name</Label>
        <Input
          id="template-name"
          placeholder="e.g., Product Label Template"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
      </div>

      <Button 
        onClick={handleUpload} 
        disabled={!file || !templateName.trim() || uploading}
        className="w-full"
      >
        {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Upload Template
      </Button>
    </div>
  );
}
