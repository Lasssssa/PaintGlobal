"use client";

import { useEffect, useState } from "react";
import Providers from "./Providers";
import Navbar from "./Navbar";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="h-14 border-b-2 border-line bg-[color-mix(in_srgb,var(--color-paper)_92%,transparent)]" />
        <div className="mx-auto max-w-[1280px] px-5 py-8">{children}</div>
      </div>
    );
  }

  return (
    <Providers>
      <Navbar />
      <div className="flex flex-1 flex-col">{children}</div>
    </Providers>
  );
}
