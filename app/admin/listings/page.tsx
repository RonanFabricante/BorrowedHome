import { Suspense } from "react";
import AdminListingsPage from "./listings-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="bh-caption text-muted-foreground">Loading…</p>}>
      <AdminListingsPage />
    </Suspense>
  );
}
