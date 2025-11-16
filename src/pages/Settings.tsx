import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";

export default function Settings() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account, workspace, and billing preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-6">
            <ProfileSettings />
          </Card>
        </TabsContent>

        <TabsContent value="workspace">
          <Card className="p-6">
            <WorkspaceSettings />
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card className="p-6">
            <BillingSettings />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
