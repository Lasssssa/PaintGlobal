"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/upload", label: "Upload" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-line" style={{ background: "color-mix(in srgb, var(--color-paper) 92%, transparent)", backdropFilter: "blur(12px)" }}>
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3">
        <Link href="/" className="flex flex-col no-underline">
          <span className="text-xl font-bold tracking-[-0.03em] text-ink">PaintGlobal</span>
          <span className="text-xs text-muted">Support paintings on-chain</span>
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-semibold transition-colors no-underline ${
                pathname === href
                  ? "text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus="avatar"
        />
      </div>
    </nav>
  );
}
