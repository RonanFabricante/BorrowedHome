import { Nav } from "@/components/nav";
import { MessagesThread } from "@/components/messages-thread";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verify user has access to this booking and it's CONFIRMED
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(id, title, host_id)
    `)
    .eq("id", id)
    .single();

  if (!booking) {
    notFound();
  }

  const hasAccess =
    booking.guest_id === user.id ||
    booking.listings.host_id === user.id;

  if (!hasAccess) {
    notFound();
  }

  // Only allow messaging for CONFIRMED bookings
  if (booking.status !== "CONFIRMED") {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-3xl mx-auto">
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold mb-2">Messaging Unlocked After Confirmation</h2>
                  <p className="text-muted-foreground">
                    Messaging is only available once the host confirms your booking request.
                    {booking.status === "PENDING" && " Your request is currently pending host approval."}
                    {booking.status === "DECLINED" && " Unfortunately, your booking request was declined."}
                    {booking.status === "CANCELLED" && " This booking has been cancelled."}
                  </p>
                  <div className="mt-4">
                    <Button asChild variant="outline">
                      <Link href={`/bookings/${booking.id}/confirm`}>View Booking Details</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <MessagesThread bookingId={id} userId={user.id} />
      </main>
    </div>
  );
}
