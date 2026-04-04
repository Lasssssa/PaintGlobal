"use client";

import { useEffect, useState, useCallback } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { fetchMetadata, fetchImageUrl, type PaintingMetadata } from "@/lib/storage";

interface RankedPainting {
  id: number;
  metadata: PaintingMetadata;
  votes: number;
  imgSrc: string;
}

export default function LeaderboardClient() {
  const [ranked, setRanked] = useState<RankedPainting[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: uris } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPaintings",
  });

  const { data: voteCounts } = useReadContracts({
    contracts:
      (uris as string[] | undefined)?.map((_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "votes" as const,
        args: [BigInt(i)] as const,
      })) ?? [],
  });

  const loadLeaderboard = useCallback(async () => {
    if (!uris || !voteCounts) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await Promise.all(
        (uris as string[]).map(async (uri, index) => {
          const metadata = await fetchMetadata(uri);
          if (!metadata) return null;
          const imgSrc = fetchImageUrl(metadata.imageCID);
          const voteResult = voteCounts[index];
          const votes =
            voteResult?.result !== undefined ? Number(voteResult.result as bigint) : 0;
          return { id: index, metadata, votes, imgSrc };
        })
      );
      const valid = items.filter(Boolean) as RankedPainting[];
      valid.sort((a, b) => b.votes - a.votes);
      setRanked(valid);
    } finally {
      setLoading(false);
    }
  }, [uris, voteCounts]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">Leaderboard</h1>
      <p className="mb-8 text-sm text-muted">Paintings ranked by on-chain support</p>

      {loading && (
        <div className="flex flex-col gap-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="card-brutalist h-20 animate-pulse"
              style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)", boxShadow: "none" }}
            />
          ))}
        </div>
      )}

      {!loading && ranked.length === 0 && (
        <div className="empty-state">
          <p className="text-base">No support yet.</p>
        </div>
      )}

      {!loading && ranked.length > 0 && (
        <ol className="flex flex-col gap-4">
          {ranked.map((p, index) => {
            const isWinner = index === 0;
            return (
              <li
                key={p.id}
                className={`card-brutalist flex items-center gap-4 p-4 ${isWinner ? "border-2 border-line" : ""}`}
                style={isWinner ? { boxShadow: "4px 4px 0 var(--color-winner)" } : { boxShadow: "none" }}
              >
                <span className="flex w-8 items-center justify-center text-xl font-bold text-ink">
                  {isWinner ? (
                    <span className="badge badge-winner">1st</span>
                  ) : (
                    `#${index + 1}`
                  )}
                </span>

                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 border-line">
                  {p.imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imgSrc} alt={p.metadata.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted" style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}>
                      🖼️
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  <span className="truncate font-bold text-ink">{p.metadata.title}</span>
                  <span className="truncate font-mono text-xs text-muted">
                    {p.metadata.author.slice(0, 6)}…{p.metadata.author.slice(-4)}
                  </span>
                </div>

                <span className="count-pill shrink-0">
                  {p.votes} {p.votes !== 1 ? "supporters" : "supporter"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
