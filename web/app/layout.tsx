import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-instrument-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

// Viewport séparé de metadata (requis par Next.js 14+)
// On ne met PAS maximum-scale=1 pour préserver l'accessibilité ;
// le zoom est évité côté CSS en imposant font-size ≥ 16px sur les inputs.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "PaintGlobal — Support paintings on-chain",
  description: "Decentralized voting platform for paintings, powered by IPFS and ARC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body>
        <div className="noise" aria-hidden="true" />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
