"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { fetchImageUrl, type PaintingMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, encodePaintingId, type NfcStatusEvent } from "@/lib/nfc";

interface Props {
  paintingId: number;
  metadata: PaintingMetadata;
  voteCount: number;
  onVoted?: () => void;
}

export default function PaintingCard({ paintingId, metadata, voteCount, onVoted }: Props) {
  const { address, isConnected } = useAccount();
  const [notification, setNotification] = useState("");
  const [nfcStatus, setNfcStatus] = useState<"idle" | "scanning" | "submitting">("idle");
  const [hasNfc, setHasNfc] = useState(false);

  console.log(metadata);
  useEffect(() => {
    setHasNfc(isNfcAvailable());
  }, []);

  const imgSrc = fetchImageUrl(metadata.imageCID);

  const { data: alreadyVoted, refetch: refetchVoted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "hasVoted",
    args: address ? [address, BigInt(paintingId)] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed) {
      setNotification("Support recorded!");
      refetchVoted();
      onVoted?.();
      setTimeout(() => setNotification(""), 3000);
    }
  }, [isConfirmed, refetchVoted, onVoted]);

  useEffect(() => {
    if (writeError) {
      const msg = writeError.message.includes("already voted")
        ? "You already supported this painting."
        : "Something went wrong.";
      setNotification(msg);
      setTimeout(() => setNotification(""), 4000);
    }
  }, [writeError]);

  const handleVote = () => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "vote",
      args: [BigInt(paintingId)],
    });
  };

  const handleNfcVote = async () => {
    try {
      setNfcStatus("scanning");
      const message = encodePaintingId(paintingId);
      const sig = await signWithNfc(message, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
          // On iOS (credential), the OS shows a native NFC sheet
          setNotification(
            evt.method === "credential"
              ? "Hold your iPhone near the bracelet…"
              : "Tap your bracelet…"
          );
        }
        if (evt.cause === "again") setNotification("Keep holding…");
        if (evt.cause === "retry") setNotification("Try again…");
        if (evt.cause === "scanned") setNotification("Scanned!");
      });

      setNfcStatus("submitting");
      setNotification("Submitting on-chain…");

      const res = await fetch("/api/nfc/vote", {
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

      setNotification("Support recorded via NFC!");
      onVoted?.();
      setTimeout(() => setNotification(""), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "NFC support failed";
      const name = err instanceof Error ? err.name : "";
      let display: string;
      if (msg.includes("already voted")) {
        display = "This bracelet already supported this painting.";
      } else if (name === "NFCMethodNotSupported") {
        display = "NFC is not supported on this device.";
      } else if (name === "NFCPermissionRequestDenied") {
        display = "NFC permission denied. Check your browser settings.";
      } else {
        display = msg.slice(0, 150);
      }
      setNotification(display);
      setTimeout(() => setNotification(""), 4000);
    } finally {
      setNfcStatus("idle");
    }
  };

  const isLoading = isPending || isConfirming;
  const isNfcBusy = nfcStatus !== "idle";

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
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-lg font-bold tracking-[-0.02em] text-ink line-clamp-1">{metadata.title}</h3>
        <p className="truncate font-mono text-xs text-muted">
          {metadata.author.slice(0, 6)}…{metadata.author.slice(-4)}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {isConnected && alreadyVoted ? (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              Supported
            </span>
          ) : isConnected ? (
            <button
              onClick={handleVote}
              disabled={isLoading}
              className="btn-brutalist btn-primary"
            >
              {isLoading ? "…" : "Support"}
            </button>
          ) : null}

          {hasNfc && (
            <button
              onClick={handleNfcVote}
              disabled={isNfcBusy}
              className="btn-brutalist"
            >
              {isNfcBusy ? (nfcStatus === "scanning" ? "Tap…" : "…") : "Tap NFC"}
            </button>
          )}

          {!isConnected && !hasNfc && (
            <span className="text-xs text-muted">Connect wallet</span>
          )}
        </div>

        {notification && (
          <div className="rounded-[var(--radius-sm)] border-2 border-success bg-success-soft px-3 py-2 text-xs font-semibold text-success">
            {notification}
          </div>
        )}
      </div>
    </div>
  );
}
