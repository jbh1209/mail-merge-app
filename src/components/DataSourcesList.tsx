import { FileSpreadsheet, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

interface DataSource {
  id: string;
  source_type: string;
  row_count: number;
  created_at: string;
  file_url: string | null;
  parsed_fields: any;
}

interface DataSourcesListProps {
  dataSources: DataSource[];
  onDelete: (id: string) => void;
}

export function DataSourcesList({ dataSources, onDelete }: DataSourcesListProps) {
  if (dataSources.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No data sources uploaded yet</p>
        <p className="text-sm mt-1">Upload your first CSV or Excel file to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dataSources.map((source) => {
        const fileName = source.file_url?.split('/').pop() || 'Unknown file';
        const cleanedFileName = fileName.replace(/^\d+_/, ''); // Remove timestamp prefix
        
        return (
          <Card key={source.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <FileSpreadsheet className="h-5 w-5 text-primary mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{cleanedFileName}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {source.source_type}
                    </Badge>
                    <span>•</span>
                    <span>{source.row_count.toLocaleString()} rows</span>
                    <span>•</span>
                    <span>{format(new Date(source.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  {source.parsed_fields?.columns && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {source.parsed_fields.columns.length} columns:{' '}
                      {source.parsed_fields.columns
                        .slice(0, 3)
                        .map((c: any) => c.cleaned || c.original)
                        .join(', ')}
                      {source.parsed_fields.columns.length > 3 && '...'}
                    </p>
                  )}
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete data source?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this data source. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(source.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
