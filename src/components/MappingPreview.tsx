import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface MappingPreviewProps {
  mappings: Record<string, string>;
  sampleData: Record<string, any>[];
}

export function MappingPreview({ mappings, sampleData }: MappingPreviewProps) {
  const templateFields = Object.keys(mappings);

  // Transform sample data based on mappings
  const previewData = sampleData.map(row => {
    const transformedRow: Record<string, any> = {};
    templateFields.forEach(templateField => {
      const dataColumn = mappings[templateField];
      transformedRow[templateField] = row[dataColumn] || '';
    });
    return transformedRow;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preview: How Data Will Appear</CardTitle>
        <CardDescription>
          First {sampleData.length} rows with your field mappings applied
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {templateFields.map(field => (
                  <TableHead key={field}>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{field}</span>
                      <Badge variant="secondary" className="text-xs w-fit">
                        from: {mappings[field]}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{idx + 1}</TableCell>
                  {templateFields.map(field => (
                    <TableCell key={field}>
                      {row[field] || <span className="text-muted-foreground italic">empty</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
