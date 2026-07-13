import { Suspense } from "react";
import AdminBookingsPage from "./bookings-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="bh-caption text-muted-foreground">Loading…</p>}>
      <AdminBookingsPage />
    </Suspense>
  );
}
