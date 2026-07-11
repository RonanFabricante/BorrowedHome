import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/footer";
import { IdleTimeoutHandler } from "@/components/idle-timeout-handler";

/**
 * Display: Space Grotesk — aggressive contemporary grotesque for oversized
 * lowercase headlines. Mono: IBM Plex Mono — all stats, times, prices,
 * captions. Body: Source Sans 3 — calm humanist for reading.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  preload: true,
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600"],
  preload: true,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
  preload: true,
});

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
    <html
      lang="en-AU"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="font-sans">
        <Providers>
          <IdleTimeoutHandler />
          <div className="flex min-h-screen flex-col">
            {children}
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
