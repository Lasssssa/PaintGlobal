"use client";

import { useEffect, useState } from "react";
import Providers from "./Providers";
import Navbar from "./Navbar";
import NfcGuard from "./NfcGuard";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="h-14 border-b-2 border-line bg-[color-mix(in_srgb,var(--color-paper)_92%,transparent)] sm:h-16" />
        <div className="mx-auto max-w-[1280px] px-5 py-8">{children}</div>
      </div>
    );
  }

  return (
    <Providers>
      <Navbar />
      <NfcGuard>
        {/* pb-16 sur mobile pour laisser de la place à la bottom nav fixe */}
        <div className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</div>
      </NfcGuard>
    </Providers>
  );
}
