import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
}

interface AdminDataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  idAccessor: keyof T;
}

export function AdminDataTable<T extends Record<string, any>>({
  data,
  columns,
  onEdit,
  onDelete,
  idAccessor,
}: AdminDataTableProps<T>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, idx) => (
              <TableHead key={idx}>{column.header}</TableHead>
            ))}
            {(onEdit || onDelete) && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                No data available
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow key={String(row[idAccessor])}>
                {columns.map((column, idx) => (
                  <TableCell key={idx}>
                    {typeof column.accessor === "function"
                      ? column.accessor(row)
                      : String(row[column.accessor])}
                  </TableCell>
                ))}
                {(onEdit || onDelete) && (
                  <TableCell className="text-right space-x-2">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
