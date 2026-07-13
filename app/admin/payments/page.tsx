import { Suspense } from "react";
import AdminPaymentsPage from "./payments-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="bh-caption text-muted-foreground">Loading…</p>}>
      <AdminPaymentsPage />
    </Suspense>
  );
}
