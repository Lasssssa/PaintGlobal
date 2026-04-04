"use client";

import { useEffect, useState, useCallback } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { fetchMetadata, type PaintingMetadata } from "@/lib/storage";
import PaintingCard from "@/components/PaintingCard";
import Link from "next/link";

interface Painting {
  id: number;
  metadata: PaintingMetadata;
  votes: number;
}

export default function GalleryClient() {
  const [paintings, setPaintings] = useState<Painting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { data: uris, refetch: refetchUris } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPaintings",
  });

  const { data: voteCounts, refetch: refetchVotes } = useReadContracts({
    contracts:
      (uris as string[] | undefined)?.map((_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "votes" as const,
        args: [BigInt(i)] as const,
      })) ?? [],
  });

  const loadPaintings = useCallback(async () => {
    if (!uris) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        (uris as string[]).map(async (uri, index) => {
          const metadata = await fetchMetadata(uri);
          if (!metadata) return null;
          const voteResult = voteCounts?.[index];
          const votes =
            voteResult?.result !== undefined ? Number(voteResult.result as bigint) : 0;
          return { id: index, metadata, votes };
        })
      );
      setPaintings(results.filter(Boolean) as Painting[]);
    } catch {
      setError("Failed to load paintings from IPFS.");
    } finally {
      setLoading(false);
    }
  }, [uris, voteCounts]);

  useEffect(() => {
    loadPaintings();
  }, [loadPaintings]);

  const handleVoted = () => {
    refetchUris();
    refetchVotes();
  };

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">Gallery</h1>
          <p className="mt-1 text-sm text-muted">Paintings stored on IPFS — support on-chain</p>
        </div>
        <Link href="/upload" className="btn-brutalist btn-primary no-underline">
          + Add a painting
        </Link>
      </div>

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="card-brutalist animate-pulse"
              style={{ aspectRatio: "16/10", background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-[var(--radius-sm)] border-2 border-danger bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && paintings.length === 0 && (
        <div className="empty-state">
          <span className="mb-3 block text-4xl">🖼️</span>
          <p className="mb-4 text-base">No paintings yet.</p>
          <Link href="/upload" className="btn-brutalist btn-primary no-underline">
            Be the first to add one!
          </Link>
        </div>
      )}

      {!loading && !error && paintings.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paintings.map((p) => (
            <PaintingCard
              key={p.id}
              paintingId={p.id}
              metadata={p.metadata}
              voteCount={p.votes}
              onVoted={handleVoted}
            />
          ))}
        </div>
      )}
    </main>
  );
}
