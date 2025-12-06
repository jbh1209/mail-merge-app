// ============================================================================
// PAGE MANAGER PANEL - Add, remove, reorder, and configure pages
// ============================================================================

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  MoreVertical, 
  Copy, 
  Trash2, 
  ArrowUp, 
  ArrowDown,
  FileText,
  Edit2
} from 'lucide-react';
import type { DesignPage, DesignDocument } from '@/lib/editor/types';
import { cn } from '@/lib/utils';

interface PageManagerPanelProps {
  document: DesignDocument;
  activePageIndex: number;
  onPageSelect: (index: number) => void;
  onDocumentUpdate: (updates: Partial<DesignDocument>) => void;
  onPageUpdate: (pageIndex: number, updates: Partial<DesignPage>) => void;
  readOnly?: boolean;
}

interface NewPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWidth: number;
  defaultHeight: number;
  onCreatePage: (page: DesignPage) => void;
}

function NewPageDialog({ 
  open, 
  onOpenChange, 
  defaultWidth, 
  defaultHeight, 
  onCreatePage 
}: NewPageDialogProps) {
  const [name, setName] = useState('');
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  
  const handleCreate = useCallback(() => {
    const newPage: DesignPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name || undefined,
      widthMm: width,
      heightMm: height,
      elements: [],
      backgroundColor: '#ffffff'
    };
    
    onCreatePage(newPage);
    onOpenChange(false);
    setName('');
    setWidth(defaultWidth);
    setHeight(defaultHeight);
  }, [name, width, height, defaultWidth, defaultHeight, onCreatePage, onOpenChange]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add New Page</DialogTitle>
          <DialogDescription>
            Create a new page in your document.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm">Page Name (optional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Front, Back, Page 2"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Width (mm)</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(parseFloat(e.target.value) || 50)}
                min={10}
                max={500}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Height (mm)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value) || 50)}
                min={10}
                max={500}
              />
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Tip: For front/back designs, use the same dimensions as the first page.
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            Create Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PageManagerPanel({
  document,
  activePageIndex,
  onPageSelect,
  onDocumentUpdate,
  onPageUpdate,
  readOnly = false
}: PageManagerPanelProps) {
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  const [renamingPageIndex, setRenamingPageIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  const { pages } = document;
  const defaultPage = pages[0];
  
  // Add a new page
  const handleAddPage = useCallback((newPage: DesignPage) => {
    onDocumentUpdate({
      pages: [...pages, newPage]
    });
    // Select the new page
    onPageSelect(pages.length);
  }, [pages, onDocumentUpdate, onPageSelect]);
  
  // Duplicate a page
  const handleDuplicatePage = useCallback((index: number) => {
    const pageToDuplicate = pages[index];
    const duplicatedPage: DesignPage = {
      ...pageToDuplicate,
      id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: pageToDuplicate.name ? `${pageToDuplicate.name} (Copy)` : `Page ${pages.length + 1}`,
      elements: pageToDuplicate.elements.map(el => ({
        ...el,
        id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }))
    };
    
    const newPages = [...pages];
    newPages.splice(index + 1, 0, duplicatedPage);
    
    onDocumentUpdate({ pages: newPages });
    onPageSelect(index + 1);
  }, [pages, onDocumentUpdate, onPageSelect]);
  
  // Delete a page
  const handleDeletePage = useCallback(() => {
    if (pageToDelete === null || pages.length <= 1) return;
    
    const newPages = pages.filter((_, i) => i !== pageToDelete);
    onDocumentUpdate({ pages: newPages });
    
    // Adjust active page if needed
    if (activePageIndex >= pageToDelete) {
      onPageSelect(Math.max(0, activePageIndex - 1));
    }
    
    setDeleteDialogOpen(false);
    setPageToDelete(null);
  }, [pageToDelete, pages, activePageIndex, onDocumentUpdate, onPageSelect]);
  
  // Move page up/down
  const handleMovePage = useCallback((index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;
    
    const newPages = [...pages];
    [newPages[index], newPages[newIndex]] = [newPages[newIndex], newPages[index]];
    
    onDocumentUpdate({ pages: newPages });
    onPageSelect(newIndex);
  }, [pages, onDocumentUpdate, onPageSelect]);
  
  // Start renaming
  const handleStartRename = useCallback((index: number) => {
    setRenamingPageIndex(index);
    setRenameValue(pages[index].name || `Page ${index + 1}`);
  }, [pages]);
  
  // Save rename
  const handleSaveRename = useCallback(() => {
    if (renamingPageIndex === null) return;
    
    onPageUpdate(renamingPageIndex, { name: renameValue || undefined });
    setRenamingPageIndex(null);
    setRenameValue('');
  }, [renamingPageIndex, renameValue, onPageUpdate]);
  
  return (
    <div className="space-y-2">
      {/* Page List */}
      <ScrollArea className="h-[calc(100%-40px)]">
        <div className="space-y-1.5 pr-2">
          {pages.map((page, index) => (
            <div
              key={page.id}
              className={cn(
                "group flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer",
                index === activePageIndex
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
              onClick={() => onPageSelect(index)}
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              
              <div className="flex-1 min-w-0">
                {renamingPageIndex === index ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleSaveRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename();
                      if (e.key === 'Escape') {
                        setRenamingPageIndex(null);
                        setRenameValue('');
                      }
                    }}
                    className="h-6 text-xs"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="text-sm font-medium truncate">
                      {page.name || `Page ${index + 1}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {page.widthMm}×{page.heightMm}mm • {page.elements.length} elements
                    </div>
                  </>
                )}
              </div>
              
              {!readOnly && renamingPageIndex !== index && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleStartRename(index)}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicatePage(index)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleMovePage(index, 'up')}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4 mr-2" />
                      Move Up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleMovePage(index, 'down')}
                      disabled={index === pages.length - 1}
                    >
                      <ArrowDown className="h-4 w-4 mr-2" />
                      Move Down
                    </DropdownMenuItem>
                    {pages.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setPageToDelete(index);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {/* Add Page Button */}
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setNewPageDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Page
        </Button>
      )}
      
      {/* New Page Dialog */}
      <NewPageDialog
        open={newPageDialogOpen}
        onOpenChange={setNewPageDialogOpen}
        defaultWidth={defaultPage?.widthMm || 50}
        defaultHeight={defaultPage?.heightMm || 30}
        onCreatePage={handleAddPage}
      />
      
      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this page? This action cannot be undone.
              All elements on this page will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}