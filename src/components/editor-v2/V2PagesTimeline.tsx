// =============================================================================
// V2 Editor Pages Timeline - Horizontal page thumbnails
// =============================================================================

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plus, Copy, Trash2, MoreVertical } from 'lucide-react';
import type { DesignPage } from '@/lib/editor-v2/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useEditorV2Store } from '@/state/editorV2Store';

interface V2PagesTimelineProps {
  pages: DesignPage[];
  activePageId: string;
  onPageSelect: (pageId: string) => void;
  onAddPage: () => void;
}

export function V2PagesTimeline({
  pages,
  activePageId,
  onPageSelect,
  onAddPage
}: V2PagesTimelineProps) {
  const { duplicatePage, deletePage } = useEditorV2Store();

  return (
    <div className="flex h-28 items-center border-t bg-card px-4">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-3 py-2">
          {pages.map((page, index) => (
            <div key={page.id} className="group relative flex-shrink-0">
              <button
                type="button"
                onClick={() => onPageSelect(page.id)}
                className={cn(
                  'relative flex h-20 w-16 flex-col items-center justify-center rounded-lg border-2 bg-white transition-all',
                  activePageId === page.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
                )}
              >
                {/* Page preview placeholder */}
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {index + 1}
                </div>
              </button>

              {/* Page actions menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={() => duplicatePage(page.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  {pages.length > 1 && (
                    <DropdownMenuItem
                      onClick={() => deletePage(page.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Page name */}
              <div className="mt-1 text-center text-xs text-muted-foreground truncate max-w-16">
                {page.name}
              </div>
            </div>
          ))}

          {/* Add page button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-20 w-16 flex-shrink-0 flex-col gap-1 border-dashed"
                onClick={onAddPage}
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs">Add</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add new page</TooltipContent>
          </Tooltip>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}