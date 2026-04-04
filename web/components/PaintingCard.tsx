"use client";

import { fetchImageUrl, type PaintingMetadata } from "@/lib/storage";

interface Props {
  paintingId: number;
  metadata: PaintingMetadata;
  voteCount: number;
}

export default function PaintingCard({ paintingId: _paintingId, metadata, voteCount }: Props) {
  const imgSrc = fetchImageUrl(metadata.imageCID);

  return (
    <div className="card-brutalist flex flex-col">
      <div className="relative border-b-2 border-line h-48 overflow-hidden">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={metadata.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-4xl text-muted"
            style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
          >
            🖼️
          </div>
        )}

        <span className="count-pill absolute top-2.5 right-3">
          {voteCount} {voteCount !== 1 ? "supporters" : "supporter"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg font-bold tracking-[-0.02em] text-ink line-clamp-1">
          {metadata.title}
        </h3>
        <p className="truncate font-mono text-xs text-muted">
          {metadata.author.slice(0, 6)}…{metadata.author.slice(-4)}
        </p>
      </div>
    </div>
  );
}
