"use client";

import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { fetchImageUrl, type PaintingMetadata } from "@/lib/storage";

interface Props {
  paintingId: number;
  metadata: PaintingMetadata;
  voteCount: number;
  nfcAddress?: string;
}

export default function PaintingCard({ paintingId, metadata, voteCount, nfcAddress }: Props) {
  const imgSrc = fetchImageUrl(metadata.imageCID);

  const { data: alreadyVoted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "hasVoted",
    args: nfcAddress ? [nfcAddress as `0x${string}`, BigInt(paintingId)] : undefined,
    query: { enabled: !!nfcAddress },
  });

  return (
    <div className="card-brutalist flex flex-col">
      <div className="relative border-b-2 border-line" style={{ aspectRatio: "16/10" }}>
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={metadata.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-muted" style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}>
            🖼️
          </div>
        )}

        <span className="count-pill absolute top-2.5 right-3">
          {voteCount} {voteCount !== 1 ? "supporters" : "supporter"}
        </span>

        {alreadyVoted && (
          <span className="absolute top-2.5 left-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
            ♥ Supported
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-lg font-bold tracking-[-0.02em] text-ink line-clamp-1">{metadata.title}</h3>
        <p className="truncate font-mono text-xs text-muted">
          {metadata.author.slice(0, 6)}…{metadata.author.slice(-4)}
        </p>
      </div>
    </div>
  );
}
