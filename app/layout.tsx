import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/footer";
import { IdleTimeoutHandler } from "@/components/idle-timeout-handler";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BorrowedHome - Day-Use Home Rentals",
  description: "Book real lived-in homes by the hour for day use only",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <IdleTimeoutHandler />
          <div className="min-h-screen flex flex-col">
            {children}
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
