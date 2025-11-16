import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DataUploadProps {
  projectId: string;
  workspaceId: string;
  onUploadComplete: (result: {
    columns: string[];
    rows: Record<string, any>[];
    rowCount: number;
    preview: Record<string, any>[];
    filePath: string;
    fileName: string;
  }) => void;
}

export function DataUpload({ projectId, workspaceId, onUploadComplete }: DataUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    // Validate file type
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    
    if (!validTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload a CSV or Excel file.");
      return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }

    setUploading(true);
    setProgress(10);
    setFileName(file.name);

    try {
      // Upload to Supabase Storage
      const filePath = `${workspaceId}/${projectId}/${Date.now()}_${file.name}`;
      
      setProgress(30);
      const { error: uploadError } = await supabase.storage
        .from('user-uploads')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setProgress(50);

      // Determine file type
      const fileType = file.name.endsWith('.csv') ? 'csv' : 
                       file.name.endsWith('.xlsx') ? 'xlsx' : 'xls';

      // Parse file using edge function
      const { data: parseData, error: parseError } = await supabase.functions.invoke(
        'parse-data-file',
        {
          body: { file_path: filePath, file_type: fileType }
        }
      );

      if (parseError) throw parseError;
      if (parseData.error) throw new Error(parseData.error);

      setProgress(100);
      
      toast.success(`File uploaded! ${parseData.rowCount} rows parsed.`);

      onUploadComplete({
        ...parseData,
        filePath,
        fileName: file.name,
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [projectId, workspaceId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
          ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
        `}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        
        <label htmlFor="file-upload" className="cursor-pointer block">
          <div className="flex flex-col items-center gap-4">
            {uploading ? (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            ) : (
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            )}
            
            <div>
              <p className="text-lg font-medium">
                {uploading ? `Uploading ${fileName}...` : 'Drop your file here'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
            </div>

            {!uploading && (
              <Button type="button" variant="secondary" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
            )}
          </div>
        </label>

        {uploading && progress > 0 && (
          <div className="mt-6 max-w-xs mx-auto">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Supported formats: CSV, Excel (.xlsx, .xls)</p>
        <p>• Maximum file size: 20MB</p>
        <p>• First row should contain column headers</p>
      </div>
    </div>
  );
}
