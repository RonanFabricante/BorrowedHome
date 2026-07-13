import { Suspense } from "react";
import AdminHostsPage from "./hosts-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="bh-caption text-muted-foreground">Loading…</p>}>
      <AdminHostsPage />
    </Suspense>
  );
}
