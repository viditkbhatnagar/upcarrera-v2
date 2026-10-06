import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { feeStructureKeys, getFeeStructure } from "@/lib/api/fee-structures";
import { FeeStructureForm } from "@/components/fee-structure/FeeStructureForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/universities/fee-structure_/$id")({
  head: () => ({ meta: [{ title: "Fee structure — upCarrera" }] }),
  component: FeeStructureDetailPage,
});

function FeeStructureDetailPage() {
  const { id } = Route.useParams();
  const query = useQuery({
    queryKey: feeStructureKeys.detail(id),
    queryFn: () => getFeeStructure(id),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-rose-500" />
        <p className="font-medium">Fee structure not found</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/universities/fee-structure">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to fee structures
          </Link>
        </Button>
      </div>
    );
  }

  return <FeeStructureForm mode="edit" detail={query.data} />;
}
