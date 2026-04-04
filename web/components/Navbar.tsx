"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

const NAV_LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/swipe", label: "Vote" },
  { href: "/upload", label: "Upload" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/collection", label: "Collection" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export default function Navbar() {
  const pathname = usePathname();
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

  return (
    <>
      {/* ===== Top bar ===== */}
      <nav
        className="sticky top-0 z-50 border-b border-line"
        style={{
          background: "rgba(247,248,250,0.94)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:h-16 sm:px-5">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2.5 no-underline"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Gemini_Generated_Image_7gj2y07gj2y07gj2.jpeg"
              alt=""
              style={{ height: "44px", width: "44px", objectFit: "contain", borderRadius: "8px" }}
            />
            <span className="text-xl font-bold tracking-[-0.03em] text-ink sm:text-2xl">
              PaintGlobal
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-6 sm:flex">
            {visibleLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm font-semibold no-underline transition-colors ${
                  pathname === href ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            ))}
            <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </nav>

      {/* ===== Mobile bottom navigation ===== */}
      <nav className="bottom-nav sm:hidden">
        <Link href="/" className={`bottom-nav-link ${pathname === "/" ? "active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill={pathname === "/" ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          Gallery
        </Link>

        <Link href="/swipe" className={`bottom-nav-link ${pathname === "/swipe" ? "active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill={pathname === "/swipe" ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth={pathname === "/swipe" ? "2.2" : "1.8"}
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Vote
        </Link>

        <Link href="/upload" className={`bottom-nav-link ${pathname === "/upload" ? "active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth={pathname === "/upload" ? "2.2" : "1.8"}
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </Link>

        <Link href="/leaderboard" className={`bottom-nav-link ${pathname === "/leaderboard" ? "active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth={pathname === "/leaderboard" ? "2.2" : "1.8"}
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="18" y="3" width="3" height="18" rx="1.5" />
            <rect x="10.5" y="8" width="3" height="13" rx="1.5" />
            <rect x="3" y="13" width="3" height="8" rx="1.5" />
          </svg>
          Leaderboard
        </Link>

        <Link href="/collection" className={`bottom-nav-link ${pathname === "/collection" ? "active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill={pathname === "/collection" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={pathname === "/collection" ? "2.2" : "1.8"}
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 3h-8l-2 4h12l-2-4z" />
          </svg>
          Collection
        </Link>

        {isAdmin && (
          <Link href="/admin" className={`bottom-nav-link ${pathname === "/admin" ? "active" : ""}`}>
            <svg width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth={pathname === "/admin" ? "2.2" : "1.8"}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Admin
          </Link>
        )}
      </nav>
    </>
  );
}
