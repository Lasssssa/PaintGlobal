"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

const NAV_LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/swipe", label: "Swipe" },
  { href: "/upload", label: "Upload" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { address } = useAccount();

  const { data: ownerAddr } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "owner",
  });

  const isAdmin =
    !!address &&
    !!ownerAddr &&
    address.toLowerCase() === (ownerAddr as string).toLowerCase();

  const visibleLinks = NAV_LINKS.filter((l) => !l.adminOnly || isAdmin);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav
      className="sticky top-0 z-50 border-b-2 border-line"
      style={{
        background: "color-mix(in srgb, var(--color-paper) 92%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3">
        <Link href="/" className="flex flex-col no-underline">
          <span className="text-xl font-bold tracking-[-0.03em] text-ink">PaintGlobal</span>
          <span className="text-xs text-muted">Support paintings on-chain</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 sm:flex">
          {visibleLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-semibold transition-colors no-underline ${
                pathname === href ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Wallet button — desktop only */}
          <div className="hidden sm:block">
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
          </div>

          {/* Hamburger — mobile only */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border-2 border-line text-ink sm:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="border-t-2 border-line bg-paper sm:hidden">
          {visibleLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-5 py-3 text-sm font-semibold no-underline transition-colors ${
                pathname === href
                  ? "text-ink bg-ink/5"
                  : "text-muted hover:text-ink hover:bg-ink/5"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
