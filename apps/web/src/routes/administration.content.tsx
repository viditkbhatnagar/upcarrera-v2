import { createFileRoute } from "@tanstack/react-router";
import { Library, ShieldAlert } from "lucide-react";
import { useAccess } from "@/components/applications/use-access";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainingVideosTab } from "@/components/administration/training-videos-tab";
import { ResourcesTab } from "@/components/administration/resources-tab";

export const Route = createFileRoute("/administration/content")({
  head: () => ({ meta: [{ title: "Content Management — upCarrera" }] }),
  component: ContentManagementPage,
});

const MANAGER_ROLES = new Set(["admin", "super_admin"]);

function ContentManagementPage() {
  const access = useAccess();
  const roleKey = access.data?.role_key;

  // Cosmetic gate; the API enforces crm:training.manage / crm:resources.manage.
  if (access.isSuccess && !(roleKey && MANAGER_ROLES.has(roleKey))) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">Admins only</div>
        <p className="text-sm text-muted-foreground">You do not have access to content management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Library className="h-6 w-6 text-primary" /> Content Management
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manage what counsellors see in Training and Resources. Inactive items are hidden from
          counsellors.
        </p>
      </div>

      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos">Training Videos</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="videos" className="mt-4">
          <TrainingVideosTab />
        </TabsContent>
        <TabsContent value="resources" className="mt-4">
          <ResourcesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
