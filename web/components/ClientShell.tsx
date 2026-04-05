"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Providers from "./Providers";
import Navbar from "./Navbar";
import NfcGuard from "./NfcGuard";

// Routes that skip NFC identity — wallet-based auth is sufficient.
const NFC_EXEMPT_PATHS = ["/admin"];

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
      <NfcGatedShell>{children}</NfcGatedShell>
    </Providers>
  );
}

// Separated so usePathname() runs inside Providers (wagmi context).
function NfcGatedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const skipNfc = NFC_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const content = (
    <div className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</div>
  );

  return skipNfc ? content : <NfcGuard>{content}</NfcGuard>;
}
