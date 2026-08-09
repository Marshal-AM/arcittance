import type { Metadata } from "next";
import { IBM_Plex_Sans, Courier_Prime } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
});

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier-prime",
});

export const metadata: Metadata = {
  title: "Arcittance — Programmable Payments on Arc",
  description:
    "Payroll, milestone escrow, subscriptions, and consumer remittance — settled in USDC & EURC on Arc with Circle CCTP, StableFX, and dual-rail funding.",
  icons: {
    icon: [
      { url: "/images/arcittance.png", type: "image/png" },
    ],
    apple: { url: "/images/arcittance.png", type: "image/png" },
    other: [{ rel: "manifest", url: "/arcittance_favicon/site.webmanifest" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${courierPrime.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
