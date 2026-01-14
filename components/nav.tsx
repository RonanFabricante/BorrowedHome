"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Calendar, LayoutList, DollarSign, UserPlus, LogOut } from "lucide-react";

export function Nav() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [isHost, setIsHost] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      
      // Check if user is a host (has any listings)
      if (data.user) {
        supabase
          .from("listings")
          .select("id")
          .eq("host_id", data.user.id)
          .limit(1)
          .then(({ data: listings, error }) => {
            // User is a host if they have at least one listing
            setIsHost(!error && (listings?.length ?? 0) > 0);
          });
      } else {
        setIsHost(false);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      
      // Check if user is a host when auth state changes
      if (session?.user) {
        supabase
          .from("listings")
          .select("id")
          .eq("host_id", session.user.id)
          .limit(1)
          .then(({ data: listings, error }) => {
            // User is a host if they have at least one listing
            setIsHost(!error && (listings?.length ?? 0) > 0);
          });
      } else {
        setIsHost(false);
      }
    });
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Logo size="md" href="/" />
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/my-bookings">
                <Button variant="ghost" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  My Bookings
                </Button>
              </Link>
              <Link href="/my-listings">
                <Button variant="ghost" className="flex items-center gap-2">
                  <LayoutList className="w-4 h-4" />
                  My Listings
                </Button>
              </Link>
              {isHost && (
                <>
                  <Link href="/host/dashboard">
                    <Button variant="ghost" className="flex items-center gap-2">
                      <LayoutList className="w-4 h-4" />
                      Host Dashboard
                    </Button>
                  </Link>
                  <Link href="/host/payouts">
                    <Button variant="ghost" className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Host Payouts
                    </Button>
                  </Link>
                </>
              )}
              <Link href="/host/onboard">
                <Button variant="outline" className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Become a Host
                </Button>
              </Link>
              <Button variant="ghost" onClick={handleSignOut} className="flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost">Log In</Button>
              </Link>
              <Link href="/auth/signup">
                <Button>Sign Up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
