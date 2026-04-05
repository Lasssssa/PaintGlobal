"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import {
  AUCTION_CONTRACT_ADDRESS,
  AUCTION_CONTRACT_ABI,
  type AuctionData,
} from "@/lib/auction-contract";
import AuctionCard from "./AuctionCard";

export default function AuctionGalleryClient() {
  const { data: countBn } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "auctionCount",
    query: { refetchInterval: 15_000 },
  });

  const count = countBn !== undefined ? Number(countBn) : 0;

  const auctionContracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: AUCTION_CONTRACT_ADDRESS,
        abi: AUCTION_CONTRACT_ABI,
        functionName: "getAuction" as const,
        args: [BigInt(i)] as const,
      })),
    [count]
  );

  const { data: auctionReads } = useReadContracts({
    contracts: auctionContracts,
    query: { enabled: count > 0, refetchInterval: 15_000 },
  });

  const activeAuctions = useMemo(() => {
    if (!auctionReads) return [];
    const now = Math.floor(Date.now() / 1000);
    return auctionReads
      .map((r, i) =>
        r.result
          ? { id: i, auction: r.result as unknown as AuctionData }
          : null
      )
      .filter(
        (a): a is { id: number; auction: AuctionData } =>
          a !== null && !a.auction.finalized && Number(a.auction.endTime) > now
      );
  }, [auctionReads]);

  const endedAuctions = useMemo(() => {
    if (!auctionReads) return [];
    const now = Math.floor(Date.now() / 1000);
    return auctionReads
      .map((r, i) =>
        r.result
          ? { id: i, auction: r.result as unknown as AuctionData }
          : null
      )
      .filter(
        (a): a is { id: number; auction: AuctionData } =>
          a !== null &&
          !a.auction.finalized &&
          Number(a.auction.endTime) <= now
      );
  }, [auctionReads]);

  const isLoading = countBn === undefined;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">Auctions</h1>
        <Link href="/auctions/create" className="btn-brutalist btn-primary px-5 py-2 text-sm">
          + Create Auction
        </Link>
      </div>

      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton rounded-[var(--radius-base)]"
              style={{ height: 280 }}
            />
          ))}
        </div>
      )}

      {!isLoading && activeAuctions.length === 0 && endedAuctions.length === 0 && (
        <div className="empty-state py-16">
          <span className="mb-4 block text-4xl">🏷️</span>
          <p className="text-base text-muted">No auctions yet.</p>
          <Link href="/auctions/create" className="btn-brutalist btn-primary mt-4 inline-block px-6 py-2">
            Create the first one
          </Link>
        </div>
      )}

      {activeAuctions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-ink">Live</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activeAuctions.map(({ id, auction }) => (
              <AuctionCard key={id} auctionId={id} auction={auction} />
            ))}
          </div>
        </section>
      )}

      {endedAuctions.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-ink">Ended — pending settlement</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {endedAuctions.map(({ id, auction }) => (
              <AuctionCard key={id} auctionId={id} auction={auction} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
