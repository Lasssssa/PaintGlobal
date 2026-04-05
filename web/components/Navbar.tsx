"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import {
  ConnectButton,
  useAccountModal,
  useChainModal,
} from "@rainbow-me/rainbowkit";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

const NAV_LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/swipe", label: "Vote" },
  { href: "/upload", label: "Upload" },
  { href: "/leaderboard", label: "Ranking" },
  { href: "/collection", label: "Collection" },
  { href: "/auctions", label: "Auctions" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

function NavbarAccountControls() {
  /** Les props `openAccountModal` de ConnectButton.Custom sont remplacées par un noop quand
   *  le réseau n’est pas dans la config ou que `chainId` est encore indéfini — d’où des clics sans effet. */
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();

  const openAccountOrFixNetwork = () => {
    if (openAccountModal) openAccountModal();
    else openChainModal?.();
  };

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted }) => {
        if (!mounted || !account) return null;

        const shortAddr =
          account.address.length >= 10
            ? `${account.address.slice(0, 4)}…${account.address.slice(-4)}`
            : account.displayName;

        const wrongNetwork = chain?.unsupported === true;

        const chainBtnClass =
          "flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border-2 bg-white shadow-[2px_2px_0_var(--color-line)] transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--color-line)] sm:h-9 sm:min-h-0 sm:min-w-0 sm:size-9 " +
          (wrongNetwork
            ? "border-danger shadow-[2px_2px_0_var(--color-danger)]"
            : "border-line");

        const accountBtnClass =
          "flex h-11 min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border-2 bg-white px-2 shadow-[2px_2px_0_var(--color-line)] transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--color-line)] sm:h-9 sm:min-h-0 sm:min-w-0 sm:px-1.5 " +
          (wrongNetwork
            ? "border-danger shadow-[2px_2px_0_var(--color-danger)]"
            : "border-line");

        return (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {chain && (
              <button
                type="button"
                onClick={() => openChainModal?.()}
                className={chainBtnClass}
                style={{ WebkitTapHighlightColor: "transparent" }}
                aria-label={chain.name ? `Réseau : ${chain.name}` : "Changer de réseau"}
              >
                {chain.hasIcon && chain.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    src={chain.iconUrl}
                    className="size-5 rounded-full sm:size-5"
                    style={{ background: chain.iconBackground }}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-ink">
                    {(chain.name ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => openAccountOrFixNetwork()}
              className={accountBtnClass}
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label={
                wrongNetwork
                  ? "Mauvais réseau — choisir un réseau ou le compte"
                  : "Compte wallet"
              }
            >
              {account.ensAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.ensAvatar}
                  alt=""
                  className="size-9 rounded-md object-cover sm:size-8"
                />
              ) : (
                <span className="max-w-[5.5rem] truncate font-mono text-xs font-semibold text-ink sm:max-w-[4.5rem]">
                  {shortAddr}
                </span>
              )}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

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
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 px-4 sm:h-16 sm:px-5">
          {/* Brand */}
          <Link
            href="/"
            className="flex min-w-0 shrink items-center gap-2.5 no-underline"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Gemini_Generated_Image_7gj2y07gj2y07gj2.jpeg"
              alt=""
              className="size-9 shrink-0 object-contain sm:size-11"
              style={{ borderRadius: "8px" }}
            />
            <span className="truncate text-lg font-bold tracking-[-0.03em] text-ink sm:text-2xl">
              PaintGlobal
            </span>
          </Link>

          {/* Wallet : compte uniquement si connecté (connexion via Auctions, etc.) */}
          <div className="flex min-w-0 items-center justify-end gap-3 sm:gap-6">
            <div className="hidden items-center gap-6 sm:flex">
              {visibleLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm font-semibold whitespace-nowrap no-underline transition-colors ${
                    pathname === href ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
            <NavbarAccountControls />
          </div>
        </div>
      </nav>

      {/* ===== Mobile bottom navigation ===== */}
      <nav className="bottom-nav sm:hidden">
        <Link
          href="/"
          className={`bottom-nav-link ${pathname === "/" ? "active" : ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={pathname === "/" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          Gallery
        </Link>

        <Link
          href="/swipe"
          className={`bottom-nav-link ${pathname === "/swipe" ? "active" : ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={pathname === "/swipe" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={pathname === "/swipe" ? "2.2" : "1.8"}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Vote
        </Link>

        <Link
          href="/leaderboard"
          className={`bottom-nav-link ${pathname === "/leaderboard" ? "active" : ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={pathname === "/leaderboard" ? "2.2" : "1.8"}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="18" y="3" width="3" height="18" rx="1.5" />
            <rect x="10.5" y="8" width="3" height="13" rx="1.5" />
            <rect x="3" y="13" width="3" height="8" rx="1.5" />
          </svg>
          Ranking
        </Link>

        <Link
          href="/collection"
          className={`bottom-nav-link ${pathname === "/collection" ? "active" : ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={pathname === "/collection" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={pathname === "/collection" ? "2.2" : "1.8"}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 3h-8l-2 4h12l-2-4z" />
          </svg>
          Collection
        </Link>

        <Link
          href="/auctions"
          className={`bottom-nav-link ${pathname.startsWith("/auctions") ? "active" : ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={pathname.startsWith("/auctions") ? "2.2" : "1.8"}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3l7 7" />
            <path d="M7.5 3.5l3 3" />
            <path d="M13 9l8 8-3 3-8-8" />
            <path d="M4 20l4-4" />
          </svg>
          Auctions
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className={`bottom-nav-link ${pathname === "/admin" ? "active" : ""}`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={pathname === "/admin" ? "2.2" : "1.8"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
