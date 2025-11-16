import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export function DeleteAccountDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmText !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: 'Please type "DELETE" to confirm',
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);

    try {
      const { error } = await supabase.functions.invoke("delete-account");

      if (error) throw error;

      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted",
      });

      // Sign out and redirect
      await supabase.auth.signOut();
      navigate("/");
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Failed to delete account",
        description: error.message,
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Delete Account Permanently?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3">
            <p className="font-semibold text-foreground">
              This action cannot be undone. This will permanently delete:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Your account and profile</li>
              <li>All projects and data sources</li>
              <li>All templates and field mappings</li>
              <li>All generated PDFs and merge jobs</li>
              <li>Your workspace and all associated data</li>
              <li>Active subscriptions will be canceled</li>
            </ul>
            <p className="text-destructive font-semibold mt-4">
              All data will be permanently erased and cannot be recovered.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="font-mono"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete Account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
