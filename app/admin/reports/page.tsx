import { Suspense } from "react";
import AdminReportsPage from "./reports-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="bh-caption text-muted-foreground">Loading…</p>}>
      <AdminReportsPage />
    </Suspense>
  );
}
