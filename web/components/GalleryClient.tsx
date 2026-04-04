"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI, PAINTING_STATUS } from "@/lib/contract";
import { fetchMetadata, type PaintingMetadata } from "@/lib/storage";
import PaintingCard from "@/components/PaintingCard";
import Link from "next/link";

const CANNES_BG = "https://ethglobal.b-cdn.net/events/cannes2026/images/ap57a/default.jpg";

interface Painting {
  id: number;
  metadata: PaintingMetadata;
  votes: number;
}

function parsePainting(result: unknown): { uri: string; author: string; status: number } | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    const [uri, author, status] = result as [string, string, number];
    return { uri, author, status: Number(status) };
  }
  const o = result as { uri: string; author: string; status: number };
  return { uri: o.uri, author: o.author, status: Number(o.status) };
}

export default function GalleryClient() {
  const [paintings, setPaintings] = useState<Painting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { data: countBn, refetch: refetchCount } = useReadContract({
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
        functionName: "getPainting" as const,
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

  const { data: paintingReads, refetch: refetchPaintings } = useReadContracts({
    contracts: paintingContracts,
    query: { enabled: n > 0 },
  });

  const { data: voteCounts, refetch: refetchVotes } = useReadContracts({
    contracts: voteContracts,
    query: { enabled: n > 0 },
  });

  const loadPaintings = useCallback(async () => {
    if (countBn === undefined) return;
    if (n === 0) {
      setLoading(false);
      return;
    }
    if (!paintingReads || !voteCounts) return;

    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        Array.from({ length: n }, async (_, i) => {
          const raw = parsePainting(paintingReads[i]?.result);
          if (!raw) return null;
          if (raw.status !== PAINTING_STATUS.Approved) return null;

          const metadata = await fetchMetadata(raw.uri);
          if (!metadata) return null;

          const votes =
            voteCounts[i]?.result !== undefined
              ? Number(voteCounts[i].result as bigint)
              : 0;

          return {
            id: i,
            metadata: { ...metadata, author: raw.author } as PaintingMetadata,
            votes,
          };
        }),
      );
      setPaintings(results.filter(Boolean) as Painting[]);
    } catch {
      setError("Failed to load paintings from IPFS.");
    } finally {
      setLoading(false);
    }
  }, [countBn, n, paintingReads, voteCounts]);

  useEffect(() => {
    loadPaintings();
  }, [loadPaintings]);

  const handleVoted = useCallback(() => {
    refetchCount();
    refetchPaintings();
    refetchVotes();
  }, [refetchCount, refetchPaintings, refetchVotes]);

  return (
    <main>
      {/* Hero — peinture impressionniste ETHGlobal Cannes */}
      <div style={{ position: "relative", height: "clamp(260px, 40vw, 420px)", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${CANNES_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center 28%",
            transform: "scale(1.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(8,6,18,0.65) 0%, rgba(8,6,18,0.20) 55%, rgba(8,6,18,0.45) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "110px",
            background: "linear-gradient(to bottom, transparent, var(--color-paper))",
          }}
        />
        <div
          className="relative mx-auto flex h-full max-w-[1280px] flex-col justify-end px-5 pb-10 sm:pb-12"
          style={{ zIndex: 1 }}
        >
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Gemini_Generated_Image_7gj2y07gj2y07gj2.jpeg"
              alt="PaintGlobal logo"
              style={{
                height: "clamp(3.5rem, 10vw, 6rem)",
                width: "auto",
                objectFit: "contain",
                borderRadius: "8px",
                flexShrink: 0,
              }}
            />
            <h1
              style={{
                color: "white",
                fontSize: "clamp(2rem, 6vw, 3.8rem)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                margin: 0,
                textShadow: "0 4px 24px rgba(0,0,0,0.35)",
              }}
            >
              Paint
              <span
                style={{
                  background: "linear-gradient(135deg, #a5f3fc 0%, #fef08a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Global
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-2 sm:px-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink sm:text-xl">All paintings</h2>
            <p className="mt-0.5 text-sm text-muted">Tap your NFC bracelet on each card to vote</p>
          </div>
        </div>

        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`sk-${i}`}
                className="skeleton rounded-[var(--radius-base)]"
                style={{ aspectRatio: "4/3" }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
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
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
