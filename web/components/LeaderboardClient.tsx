"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  PAINTING_STATUS,
} from "@/lib/contract";
import {
  fetchMetadata,
  fetchImageUrl,
  type PaintingMetadata,
} from "@/lib/storage";

interface RankedPainting {
  id: number;
  metadata: PaintingMetadata;
  author: string;
  votes: number;
  imgSrc: string;
}

function paintingTuple(
  result: unknown,
): { uri: string; author: string; status: number } | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    const [uri, author, status] = result as [string, string, number];
    return { uri, author, status: Number(status) };
  }
  const o = result as { uri: string; author: string; status: number };
  return { uri: o.uri, author: o.author, status: Number(o.status) };
}

export default function LeaderboardClient() {
  const [ranked, setRanked] = useState<RankedPainting[]>([]);
  const [loading, setLoading] = useState(true);

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
    [n],
  );

  const voteContracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "votes" as const,
        args: [BigInt(i)] as const,
      })),
    [n],
  );

  const { data: paintingReads } = useReadContracts({
    contracts: paintingContracts,
    query: { enabled: n >= 0 },
  });

  const { data: voteCounts } = useReadContracts({
    contracts: voteContracts,
    query: { enabled: n >= 0 },
  });

  const loadLeaderboard = useCallback(async () => {
    if (countBn === undefined) return;
    if (n > 0 && (paintingReads === undefined || voteCounts === undefined))
      return;

    setLoading(true);
    try {
      const items: RankedPainting[] = [];
      for (let index = 0; index < n; index++) {
        const row = paintingTuple(paintingReads?.[index]?.result);
        if (!row || row.status !== PAINTING_STATUS.Approved) continue;
        const metadata = await fetchMetadata(row.uri);
        if (!metadata) continue;
        const imgSrc = fetchImageUrl(metadata.imageCID);
        const voteResult = voteCounts?.[index];
        const votes =
          voteResult?.result !== undefined
            ? Number(voteResult.result as bigint)
            : 0;
        items.push({ id: index, metadata, author: row.author, votes, imgSrc });
      }
      items.sort((a, b) => b.votes - a.votes);
      setRanked(items);
    } finally {
      setLoading(false);
    }
  }, [countBn, n, paintingReads, voteCounts]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const CANNES_BG =
    "https://ethglobal.b-cdn.net/events/cannes2026/images/ap57a/default.jpg";

  return (
    <main>
      {/* Painting header strip */}
      <div
        style={{ position: "relative", height: "160px", overflow: "hidden" }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${CANNES_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center 52%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 60%, var(--color-paper) 100%)",
          }}
        />
        <div
          className="relative mx-auto flex h-full max-w-3xl flex-col justify-end px-5 pb-4"
          style={{ zIndex: 1 }}
        >
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{
              color: "white",
              textShadow: "0 2px 10px rgba(0,0,0,0.35)",
              margin: 0,
            }}
          >
            Leaderboard
          </h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        {loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`skel-${i}`} className="skeleton h-20 rounded-2xl" />
            ))}
          </div>
        )}

        {!loading && ranked.length === 0 && (
          <div className="empty-state">
            <p className="text-base">No support recorded yet.</p>
          </div>
        )}

        {!loading && ranked.length > 0 && (
          <ol className="flex flex-col gap-3">
            {ranked.map((p, index) => {
              const medals = ["🥇", "🥈", "🥉"];
              const medalColors = [
                "linear-gradient(135deg,#fbbf24,#f59e0b)",
                "linear-gradient(135deg,#d1d5db,#9ca3af)",
                "linear-gradient(135deg,#f97316,#c2410c)",
              ];
              const isTop3 = index < 3;
              return (
                <li
                  key={p.id}
                  className="card-brutalist flex items-center gap-3 p-3.5"
                  style={{
                    boxShadow: isTop3
                      ? `0 2px 16px rgba(0,0,0,0.07), inset 0 0 0 1.5px ${
                          index === 0
                            ? "rgba(251,191,36,0.45)"
                            : index === 1
                              ? "rgba(209,213,219,0.6)"
                              : "rgba(249,115,22,0.35)"
                        }`
                      : "0 1px 6px rgba(0,0,0,0.05)",
                    animation: `fadeInUp 0.3s ${index * 0.04}s both`,
                  }}
                >
                  {/* Rank */}
                  <div className="flex w-9 shrink-0 items-center justify-center">
                    {isTop3 ? (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                        style={{
                          background: medalColors[index],
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                        }}
                      >
                        {medals[index]}
                      </span>
                    ) : (
                      <span className="font-mono text-sm font-bold text-muted">
                        #{index + 1}
                      </span>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                    {p.imgSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imgSrc}
                        alt={p.metadata.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-full items-center justify-center text-muted"
                        style={{
                          background: "linear-gradient(135deg,#f4f0ff,#e0f2fe)",
                        }}
                      >
                        🖼️
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold leading-tight text-ink">
                      {p.metadata.title}
                    </span>
                    <span className="truncate font-mono text-xs text-muted">
                      {p.author.slice(0, 6)}…{p.author.slice(-4)}
                    </span>
                  </div>

                  {/* Votes */}
                  <div className="shrink-0 text-right">
                    <p
                      className="font-mono font-black leading-none"
                      style={{
                        fontSize: "1.15rem",
                        color: index === 0 ? "#f59e0b" : "var(--color-ink)",
                      }}
                    >
                      {p.votes}
                    </p>
                    <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted">
                      votes
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
