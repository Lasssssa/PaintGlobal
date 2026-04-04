"use client";

import { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { fetchImageUrl, type PaintingMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, encodePaintingId, type NfcStatusEvent } from "@/lib/nfc";

interface Props {
  paintingId: number;
  metadata: PaintingMetadata;
  voteCount: number;
  tipCount: number;
  nfcAddress?: string;
}

export default function PaintingCard({ paintingId, metadata, voteCount, tipCount, nfcAddress }: Props) {
  const imgSrc = fetchImageUrl(metadata.imageCID);
  const [hasNfc, setHasNfc] = useState(false);
  const [tipStatus, setTipStatus] = useState<"idle" | "scanning" | "submitting">("idle");
  const [tipMsg, setTipMsg] = useState("");

  useEffect(() => {
    setHasNfc(isNfcAvailable());
  }, []);

  const { data: alreadyTipped, refetch: refetchTipped } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "hasTipped",
    args: nfcAddress ? [nfcAddress as `0x${string}`, BigInt(paintingId)] : undefined,
    query: { enabled: !!nfcAddress },
  });

  const handleTip = async () => {
    try {
      setTipStatus("scanning");
      setTipMsg("Tap your bracelet to tip…");
      const message = encodePaintingId(paintingId);
      const sig = await signWithNfc(message, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
          setTipMsg(
            evt.method === "credential"
              ? "Hold your iPhone near the bracelet…"
              : "Tap your bracelet…"
          );
        }
        if (evt.cause === "again") setTipMsg("Keep holding…");
        if (evt.cause === "scanned") setTipMsg("Scanned!");
      });

      setTipStatus("submitting");
      setTipMsg("Recording on-chain…");

      const res = await fetch("/api/nfc/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paintingId,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${message}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setTipMsg("Tipped!");
      refetchTipped();
      setTimeout(() => setTipMsg(""), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tip failed";
      let display = msg.slice(0, 120);
      if (msg.includes("already tipped")) display = "Already tipped this painting.";
      setTipMsg(display);
      setTimeout(() => setTipMsg(""), 4000);
    } finally {
      setTipStatus("idle");
    }
  };

  const isTipBusy = tipStatus !== "idle";

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
          <div className="flex h-full items-center justify-center text-4xl text-muted" style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}>
            🖼️
          </div>
        )}

        <span className="count-pill absolute top-2.5 right-3">
          {voteCount} {voteCount !== 1 ? "supporters" : "supporter"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg font-bold tracking-[-0.02em] text-ink line-clamp-1">{metadata.title}</h3>
        <p className="truncate font-mono text-xs text-muted">
          {metadata.author.slice(0, 6)}…{metadata.author.slice(-4)}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {/* Tip count */}
          <span className="text-xs text-muted">
            ☆ {tipCount} {tipCount !== 1 ? "tips" : "tip"}
          </span>

          {/* Tip button — NFC only */}
          {hasNfc && (
            alreadyTipped ? (
              <span className="text-xs font-semibold text-accent">★ Tipped</span>
            ) : (
              <button
                onClick={handleTip}
                disabled={isTipBusy}
                className="btn-brutalist py-1 px-3 text-xs"
              >
                {isTipBusy ? "…" : "☆ Tip"}
              </button>
            )
          )}
        </div>

        {tipMsg && (
          <p className="text-xs text-accent animate-pulse">{tipMsg}</p>
        )}
      </div>
    </div>
  );
}
