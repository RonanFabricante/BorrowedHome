import { requireSuperadminPage } from "@/lib/admin/auth";
import { Nav } from "@/components/nav";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperadminPage();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="bh-micro mb-2 text-muted-foreground">platform</p>
        <h1 className="font-display mb-6 text-3xl font-bold lowercase tracking-tighter">
          admin
        </h1>
        <AdminNav />
        {children}
      </main>
    </div>
  );
}
