import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotificationsPageContent } from "@/components/notifications-page-content";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="bh-micro mb-2">inbox</p>
          <h1 className="font-display text-3xl font-bold lowercase tracking-tighter sm:text-4xl">
            notifications
          </h1>
        </header>
        <NotificationsPageContent userId={user.id} />
      </main>
    </div>
  );
}
