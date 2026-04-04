"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI, PAINTING_STATUS } from "@/lib/contract";
import { fetchMetadata, type PaintingMetadata } from "@/lib/storage";
import PaintingCard from "@/components/PaintingCard";
import Link from "next/link";

interface Painting {
  id: number;
  metadata: PaintingMetadata;
  votes: number;
  author: `0x${string}`;
}

function paintingTuple(
  result: unknown
): { uri: string; author: `0x${string}`; status: number } | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    const [uri, author, status] = result as [string, `0x${string}`, number];
    return { uri, author, status: Number(status) };
  }
  const o = result as { uri: string; author: `0x${string}`; status: number };
  return { uri: o.uri, author: o.author, status: Number(o.status) };
}

export default function GalleryClient() {
  const [paintings, setPaintings] = useState<Painting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { data: countBn } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "paintingCount",
  });

  const n = countBn !== undefined ? Number(countBn) : 0;

  const paintingContracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "paintings" as const,
        args: [BigInt(i)] as const,
      })),
    [n]
  );

  const voteContracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "votes" as const,
        args: [BigInt(i)] as const,
      })),
    [n]
  );

  const { data: paintingReads } = useReadContracts({
    contracts: paintingContracts,
    query: { enabled: n >= 0 },
  });

  const { data: voteCounts } = useReadContracts({
    contracts: voteContracts,
    query: { enabled: n >= 0 },
  });

  const loadPaintings = useCallback(async () => {
    if (countBn === undefined) return;
    if (n > 0 && (paintingReads === undefined || voteCounts === undefined)) return;

    setLoading(true);
    setError("");
    try {
      const results: Painting[] = [];
      for (let index = 0; index < n; index++) {
        const row = paintingTuple(paintingReads?.[index]?.result);
        if (!row || row.status !== PAINTING_STATUS.Approved) continue;
        const metadata = await fetchMetadata(row.uri);
        if (!metadata) continue;
        const voteResult = voteCounts?.[index];
        const votes =
          voteResult?.result !== undefined ? Number(voteResult.result as bigint) : 0;
        results.push({
          id: index,
          metadata,
          votes,
          author: row.author,
        });
      }
      setPaintings(results);
    } catch {
      setError("Failed to load paintings from IPFS.");
    } finally {
      setLoading(false);
    }
  }, [countBn, n, paintingReads, voteCounts]);

  useEffect(() => {
    loadPaintings();
  }, [loadPaintings]);

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">Gallery</h1>
          <p className="mt-1 text-sm text-muted">Approved paintings on IPFS</p>
        </div>
        <div className="flex gap-3">
          <Link href="/swipe" className="btn-brutalist no-underline">
            Swipe to vote →
          </Link>
          <Link href="/upload" className="btn-brutalist btn-primary no-underline">
            + Add a painting
          </Link>
        </div>
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
          <p className="mb-4 text-base">No approved paintings yet.</p>
          <Link href="/upload" className="btn-brutalist btn-primary no-underline">
            Submit one for review
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
            />
          ))}
        </div>
      )}
    </main>
  );
}
