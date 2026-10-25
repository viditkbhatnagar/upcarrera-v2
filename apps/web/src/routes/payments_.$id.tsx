import { createFileRoute } from "@tanstack/react-router";
import { CounsellorPaymentDetail } from "@/components/counsellor/screens/payment-detail";

// The trailing underscore on `payments_` keeps this a sibling of /payments
// rather than a child (the list route renders no <Outlet />).
export const Route = createFileRoute("/payments_/$id")({
  head: () => ({ meta: [{ title: "Payment — upCarrera" }] }),
  component: PaymentDetailRoute,
});

function PaymentDetailRoute() {
  const { id } = Route.useParams();
  return <CounsellorPaymentDetail idParam={id} />;
}
