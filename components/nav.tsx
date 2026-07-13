"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Calendar, LayoutList, DollarSign, UserPlus, LogOut, Shield } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  children,
  className,
  matchPrefix,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  matchPrefix?: boolean;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (matchPrefix && href !== "/" && pathname.startsWith(href));

  return (
    <Link href={href}>
      <Button
        variant="ghost"
        className={cn(
          "relative rounded-none px-3",
          className,
          isActive &&
            "font-semibold text-foreground shadow-[inset_0_-2px_0_0_hsl(var(--color-accent))]"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {children}
      </Button>
    </Link>
  );
}

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  const refreshRoleFlags = (userId: string | undefined) => {
    if (!userId) {
      setIsHost(false);
      setIsSuperadmin(false);
      return;
    }

    supabase
      .from("listings")
      .select("id")
      .eq("host_id", userId)
      .limit(1)
      .then(({ data: listings, error }) => {
        setIsHost(!error && (listings?.length ?? 0) > 0);
      });

    supabase
      .from("profiles")
      .select("is_superadmin")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data: profile }) => {
        setIsSuperadmin(!!profile?.is_superadmin);
      });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      refreshRoleFlags(data.user?.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      refreshRoleFlags(session?.user?.id);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const authActive =
    pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup");

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="bh-container flex items-center justify-between py-3.5">
        <Logo size="md" href="/" showText />
        <div className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <NotificationsBell />
              {isSuperadmin && (
                <NavLink
                  href="/admin"
                  matchPrefix
                  className="hidden sm:flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </NavLink>
              )}
              <NavLink href="/my-bookings" className="hidden sm:flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                My Bookings
              </NavLink>
              <NavLink href="/my-listings" className="hidden md:flex items-center gap-2">
                <LayoutList className="w-4 h-4" />
                My Listings
              </NavLink>
              {isHost && (
                <>
                  <NavLink
                    href="/host/dashboard"
                    matchPrefix
                    className="hidden lg:flex items-center gap-2"
                  >
                    <LayoutList className="w-4 h-4" />
                    Host Dashboard
                  </NavLink>
                  <NavLink href="/host/payouts" className="hidden lg:flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Payouts
                  </NavLink>
                </>
              )}
              <NavLink href="/host/onboard" matchPrefix className="hidden sm:flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Become a Host
              </NavLink>
              <Button variant="ghost" onClick={handleSignOut} className="flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button
                  variant="ghost"
                  className={cn(
                    authActive && pathname.includes("login") && "bg-accent text-accent-foreground font-medium"
                  )}
                  aria-current={pathname.includes("login") ? "page" : undefined}
                >
                  Log In
                </Button>
              </Link>
              <Link href="/auth/signup">
                <Button
                  aria-current={pathname.includes("signup") ? "page" : undefined}
                  className={cn(
                    pathname.includes("signup") && "ring-2 ring-ring ring-offset-2"
                  )}
                >
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
