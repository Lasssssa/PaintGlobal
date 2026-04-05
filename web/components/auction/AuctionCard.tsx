"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { ZERO_ADDRESS, type AuctionData } from "@/lib/auction-contract";

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud";

function ipfsToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://${GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

interface NftMeta {
  name: string;
  image: string;
  description?: string;
}

interface Props {
  auctionId: number;
  auction: AuctionData;
}

export default function AuctionCard({ auctionId, auction }: Props) {
  const [meta, setMeta] = useState<NftMeta | null>(null);

  const endTimeSec = Number(auction.endTime);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, endTimeSec - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const id = setInterval(
      () => setRemaining(Math.max(0, endTimeSec - Math.floor(Date.now() / 1000))),
      1000
    );
    return () => clearInterval(id);
  }, [endTimeSec]);

  // Fetch NFT metadata from tokenURI
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // We read the tokenURI from the contract client-side via fetch
        // The AuctionCard receives the auction struct, but not the tokenURI.
        // We'll show a placeholder and let AuctionDetailClient show full metadata.
        // For gallery cards, we show minimal info.
      } catch {
        // ignore
      }
    }
    load();
    return () => { cancelled = true; };
  }, [auction.tokenId, auction.nftContract]);

  const ended = remaining === 0;
  const hasBids = auction.highestPayer !== ZERO_ADDRESS;

  const formatTime = (s: number) => {
    if (s <= 0) return "Ended";
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
    return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
  };

  return (
    <Link href={`/auctions/${auctionId}`} className="block group">
      <div className="card-brutalist flex flex-col h-full transition-transform group-hover:-translate-y-0.5">
        {/* Image placeholder */}
        <div
          className="border-b-2 border-line flex items-center justify-center text-4xl"
          style={{ height: 180, background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
        >
          🖼️
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {/* Token ID + contract */}
          <div className="flex items-center justify-between">
            <span className="count-pill">NFT #{auction.tokenId.toString()}</span>
            <span
              className={`font-mono tabular-nums text-xs font-semibold ${
                ended ? "text-danger" : remaining < 3600 ? "text-accent" : "text-muted"
              }`}
            >
              {formatTime(remaining)}
            </span>
          </div>

          {/* Seller */}
          <p className="truncate font-mono text-xs text-muted">
            Seller {auction.seller.slice(0, 6)}…{auction.seller.slice(-4)}
          </p>

          {/* Current bid */}
          <div className="mt-auto pt-2 border-t border-line/50">
            <p className="text-xs text-muted">
              {hasBids ? "Current bid" : "Starting price"}
            </p>
            <p className="text-base font-bold text-ink">
              {formatEther(hasBids ? auction.highestBid : auction.startPrice)} USDC
            </p>
            {hasBids && (
              <p className="truncate font-mono text-xs text-muted">
                NFT to {auction.highestNftRecipient.slice(0, 6)}…{auction.highestNftRecipient.slice(-4)}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
