import { createFileRoute } from "@tanstack/react-router";
import { CounsellorResourceFolder } from "@/components/counsellor/screens/resource-folder";

// `resources_` keeps this a sibling of /resources, not a child. The `$id` param is
// the folder (category) name, URL-decoded by the router.
export const Route = createFileRoute("/resources_/$id")({
  head: () => ({ meta: [{ title: "Resources — upCarrera" }] }),
  component: ResourceFolderRoute,
});

function ResourceFolderRoute() {
  const { id } = Route.useParams();
  return <CounsellorResourceFolder folderName={id} />;
}
