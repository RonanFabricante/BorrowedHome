import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/footer";
import { IdleTimeoutHandler } from "@/components/idle-timeout-handler";

/**
 * Display: Fraunces — soft modern serif with optical sizing and soft
 * terminals; editorial without Canela licensing cost. Body: Source Sans 3 —
 * humanist companion that stays calm next to the loud headline.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "500", "600"],
  preload: true,
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
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
    <html lang="en-AU" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
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
