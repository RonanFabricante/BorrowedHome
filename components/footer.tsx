import Link from "next/link";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <Logo size="sm" href="/" />
            <p>&copy; {new Date().getFullYear()} BorrowedHome. All rights reserved.</p>
          </div>
          <div className="flex gap-4">
            <Link href="/terms/guest-au" className="hover:text-foreground transition-colors">
              Guest Terms (AU)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
