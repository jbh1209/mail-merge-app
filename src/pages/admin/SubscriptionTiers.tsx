import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function SubscriptionTiers() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["admin-subscription-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .order("price_cents");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (tier: any) => {
      const { error } = await supabase.from("subscription_tiers").insert(tier);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-tiers"] });
      toast.success("Tier created successfully");
      setIsDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...tier }: any) => {
      const { error } = await supabase
        .from("subscription_tiers")
        .update(tier)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-tiers"] });
      toast.success("Tier updated successfully");
      setIsDialogOpen(false);
      setEditingTier(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_tiers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-tiers"] });
      toast.success("Tier deleted successfully");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tierData = {
      tier_name: formData.get("tier_name"),
      display_name: formData.get("display_name"),
      price_cents: parseInt(formData.get("price_cents") as string),
      pages_per_month: parseInt(formData.get("pages_per_month") as string),
      stripe_price_id: formData.get("stripe_price_id"),
      is_active: formData.get("is_active") === "true",
    };

    if (editingTier) {
      updateMutation.mutate({ id: editingTier.id, ...tierData });
    } else {
      createMutation.mutate(tierData);
    }
  };

  const columns = [
    { header: "Tier Name", accessor: "tier_name" as const },
    { header: "Display Name", accessor: "display_name" as const },
    {
      header: "Price",
      accessor: (row: any) => `$${(row.price_cents / 100).toFixed(2)}`,
    },
    { header: "Pages/Month", accessor: "pages_per_month" as const },
    {
      header: "Status",
      accessor: (row: any) => (
        <Badge variant={row.is_active ? "default" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Subscription Tiers</h1>
          <p className="text-muted-foreground mt-2">Manage subscription plans and pricing</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingTier(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Tier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTier ? "Edit" : "Create"} Subscription Tier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="tier_name">Tier Name</Label>
                <Input
                  id="tier_name"
                  name="tier_name"
                  defaultValue={editingTier?.tier_name}
                  required
                />
              </div>
              <div>
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  name="display_name"
                  defaultValue={editingTier?.display_name}
                  required
                />
              </div>
              <div>
                <Label htmlFor="price_cents">Price (cents)</Label>
                <Input
                  id="price_cents"
                  name="price_cents"
                  type="number"
                  defaultValue={editingTier?.price_cents}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pages_per_month">Pages per Month</Label>
                <Input
                  id="pages_per_month"
                  name="pages_per_month"
                  type="number"
                  defaultValue={editingTier?.pages_per_month}
                  required
                />
              </div>
              <div>
                <Label htmlFor="stripe_price_id">Stripe Price ID</Label>
                <Input
                  id="stripe_price_id"
                  name="stripe_price_id"
                  defaultValue={editingTier?.stripe_price_id}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  name="is_active"
                  defaultChecked={editingTier?.is_active ?? true}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <Button type="submit" className="w-full">
                {editingTier ? "Update" : "Create"} Tier
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <AdminDataTable
        data={tiers}
        columns={columns}
        idAccessor="id"
        onEdit={(tier) => {
          setEditingTier(tier);
          setIsDialogOpen(true);
        }}
        onDelete={(tier) => {
          if (confirm("Are you sure you want to delete this tier?")) {
            deleteMutation.mutate(tier.id);
          }
        }}
      />
    </div>
  );
}
