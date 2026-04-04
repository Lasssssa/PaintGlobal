"use client";

import { useState, useEffect, useCallback, useMemo, useContext, useRef } from "react";
import type { ReactNode, PointerEvent } from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI, PAINTING_STATUS } from "@/lib/contract";
import { fetchMetadata, fetchImageUrl, type PaintingMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, encodeVoteMessage, type NfcStatusEvent } from "@/lib/nfc";
import { NfcIdentityContext } from "@/lib/nfc-context";

// ── Swipe card (no external dependency) ──────────────────────────────────────

const SWIPE_THRESHOLD = 80; // px

function SwipeCard({
  onSwipe,
  disabled,
  children,
}: {
  onSwipe: (dir: "left" | "right") => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const deltaX = useRef(0);
  const dragging = useRef(false);

  const resetCard = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = "transform 0.3s ease";
    cardRef.current.style.transform = "translateX(0px) rotate(0deg)";
    setTimeout(() => {
      if (cardRef.current) cardRef.current.style.transition = "";
    }, 300);
    deltaX.current = 0;
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    startX.current = e.clientX;
    dragging.current = true;
    cardRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return;
    deltaX.current = e.clientX - startX.current;
    const rotate = deltaX.current * 0.07;
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${deltaX.current}px) rotate(${rotate}deg)`;
    }
  };

  const handlePointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const d = deltaX.current;

    if (Math.abs(d) >= SWIPE_THRESHOLD && !disabled) {
      const dir = d > 0 ? "right" : "left";
      if (cardRef.current) {
        cardRef.current.style.transition = "transform 0.35s ease";
        cardRef.current.style.transform = `translateX(${dir === "right" ? 600 : -600}px) rotate(${dir === "right" ? 25 : -25}deg)`;
      }
      setTimeout(() => onSwipe(dir), 350);
    } else {
      resetCard();
    }
  };

  return (
    <div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetCard}
      style={{ touchAction: "none", cursor: disabled ? "default" : "grab", userSelect: "none" }}
    >
      {children}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "nfc-unavailable" | "identity" | "loading" | "swiping" | "empty" | "error";

interface SwipePainting {
  id: number;
  author: `0x${string}`;
  metadata: PaintingMetadata;
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

// ── Main component ────────────────────────────────────────────────────────────

export default function SwipeClient() {
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const [phase, setPhase] = useState<Phase>("identity");
  const [paintings, setPaintings] = useState<SwipePainting[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nfcStatus, setNfcStatus] = useState<"idle" | "identity-scan" | "vote-scan" | "submitting">("idle");
  const [notification, setNotification] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const available = isNfcAvailable();
    if (!available) {
      setPhase("nfc-unavailable");
    } else if (nfcAddress) {
      // Already identified from a previous session interaction
      setPhase("loading");
    }
  }, [nfcAddress]);

  // ── Contract reads ──────────────────────────────────────────────────────────

  const { data: countBn } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "paintingCount",
    query: { enabled: phase === "loading" },
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

  const hasVotedContracts = useMemo(
    () =>
      nfcAddress
        ? Array.from({ length: n }, (_, i) => ({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: "hasVoted" as const,
            args: [nfcAddress as `0x${string}`, BigInt(i)] as const,
          }))
        : [],
    [n, nfcAddress]
  );

  const hasVotedNegativeContracts = useMemo(
    () =>
      nfcAddress
        ? Array.from({ length: n }, (_, i) => ({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: "hasVotedNegative" as const,
            args: [nfcAddress as `0x${string}`, BigInt(i)] as const,
          }))
        : [],
    [n, nfcAddress]
  );

  const { data: paintingReads } = useReadContracts({
    contracts: paintingContracts,
    query: { enabled: phase === "loading" && n > 0 },
  });

  const { data: hasVotedReads } = useReadContracts({
    contracts: hasVotedContracts,
    query: { enabled: phase === "loading" && n > 0 && !!nfcAddress },
  });

  const { data: hasVotedNegativeReads } = useReadContracts({
    contracts: hasVotedNegativeContracts,
    query: { enabled: phase === "loading" && n > 0 && !!nfcAddress },
  });

  // ── Load paintings once contract data is ready ──────────────────────────────

  const loadPaintings = useCallback(async () => {
    if (!nfcAddress) return;
    if (countBn === undefined) return;
    if (n > 0 && (paintingReads === undefined || hasVotedReads === undefined || hasVotedNegativeReads === undefined)) return;

    try {
      const results: SwipePainting[] = [];
      for (let i = 0; i < n; i++) {
        const row = paintingTuple(paintingReads?.[i]?.result);
        if (!row || row.status !== PAINTING_STATUS.Approved) continue;
        if (row.author.toLowerCase() === nfcAddress.toLowerCase()) continue;
        if (hasVotedReads?.[i]?.result === true) continue;
        if (hasVotedNegativeReads?.[i]?.result === true) continue;

        const metadata = await fetchMetadata(row.uri);
        if (!metadata) continue;
        results.push({ id: i, author: row.author, metadata });
      }
      setPaintings(results);
      setCurrentIndex(0);
      setPhase(results.length === 0 ? "empty" : "swiping");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load paintings. Please try again.");
      setPhase("error");
    }
  }, [countBn, n, nfcAddress, paintingReads, hasVotedReads, hasVotedNegativeReads]);

  useEffect(() => {
    if (phase === "loading") {
      loadPaintings();
    }
  }, [phase, loadPaintings]);

  // ── NFC identity tap ────────────────────────────────────────────────────────

  const handleIdentityTap = async () => {
    try {
      setNfcStatus("identity-scan");
      setNotification("Tap your bracelet…");
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
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
      setNfcAddress(sig.signerAddress);
      setNotification("");
      setPhase("loading");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = "NFC scan failed.";
      if (name === "NFCMethodNotSupported") msg = "NFC is not supported on this device.";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied.";
      setNotification(msg);
    } finally {
      setNfcStatus("idle");
    }
  };

  // ── Swipe handler ───────────────────────────────────────────────────────────

  const handleSwipe = useCallback(async (dir: "left" | "right", painting: SwipePainting) => {
    const support = dir === "right";
    try {
      setNfcStatus("vote-scan");
      setNotification(support ? "Tap your bracelet to support…" : "Tap your bracelet to pass…");

      const message = encodeVoteMessage(painting.id, support);
      const sig = await signWithNfc(message, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
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
      setNotification("Recording on-chain…");

      const res = await fetch("/api/nfc/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paintingId: painting.id,
          support,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${message}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setNotification(support ? "Supported!" : "Passed.");
      setTimeout(() => setNotification(""), 2000);

      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= paintings.length) setTimeout(() => setPhase("empty"), 500);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Vote failed";
      let display = msg.slice(0, 150);
      if (msg.includes("already voted")) display = "You already voted on this painting.";
      else if (msg.includes("cannot vote own")) display = "You cannot vote on your own painting.";
      setNotification(display);
      setTimeout(() => setNotification(""), 4000);
    } finally {
      setNfcStatus("idle");
    }
  }, [paintings.length]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === "nfc-unavailable") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <div className="empty-state py-16">
          <span className="mb-4 block text-4xl">📲</span>
          <p className="text-sm text-muted">An NFC bracelet is required to vote.</p>
        </div>
      </main>
    );
  }

  if (phase === "identity") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <p className="mb-10 text-sm text-muted">Swipe right to support, left to pass.</p>
        <div className="card-brutalist flex flex-col items-center gap-6 p-10">
          <span className="text-6xl">📲</span>
          <p className="text-base font-semibold text-ink">Tap your NFC bracelet to start</p>
          <button
            onClick={handleIdentityTap}
            disabled={nfcStatus === "identity-scan"}
            className="btn-brutalist btn-primary px-8 py-3 text-base"
          >
            {nfcStatus === "identity-scan" ? "Scanning…" : "Tap bracelet"}
          </button>
          {notification && (
            <p className="text-sm text-accent animate-pulse">{notification}</p>
          )}
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <div className="card-brutalist animate-pulse p-10">
          <div className="flex flex-col items-center gap-4">
            <div className="h-48 w-full rounded bg-ink/10" />
            <div className="h-4 w-2/3 rounded bg-ink/10" />
          </div>
        </div>
      </main>
    );
  }

  if (phase === "empty") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">All done!</h1>
        <div className="empty-state py-16">
          <span className="mb-4 block text-4xl">✅</span>
          <p className="mb-6 text-base text-muted">You&apos;ve voted on all available paintings.</p>
          <Link href="/" className="btn-brutalist btn-primary no-underline">
            Back to Gallery
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <div className="rounded-[var(--radius-sm)] border-2 border-danger bg-danger-soft p-4 text-sm text-danger">
          {errorMsg}
        </div>
        <Link href="/" className="btn-brutalist mt-6 inline-block no-underline">
          Back to Gallery
        </Link>
      </main>
    );
  }

  // Swiping phase
  const current = paintings[currentIndex];
  const isNfcBusy = nfcStatus !== "idle";

  if (!current) return null;

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <span className="text-sm text-muted">
          {currentIndex + 1} / {paintings.length}
        </span>
      </div>

      <SwipeCard onSwipe={(dir) => handleSwipe(dir, current)} disabled={isNfcBusy}>
        <div className="card-brutalist w-full">
          <div className="relative border-b-2 border-line" style={{ aspectRatio: "4/3" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fetchImageUrl(current.metadata.imageCID)}
              alt={current.metadata.title}
              className="h-full w-full object-cover"
              draggable={false}
            />
            {/* Swipe direction hints */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
              <span className="rounded-lg border-4 border-danger px-4 py-2 text-lg font-black text-danger opacity-20 rotate-[-15deg]">
                PASS
              </span>
              <span className="rounded-lg border-4 border-success px-4 py-2 text-lg font-black text-success opacity-20 rotate-[15deg]">
                SUPPORT
              </span>
            </div>
          </div>
          <div className="p-5">
            <h2 className="text-xl font-bold tracking-[-0.02em] text-ink line-clamp-1">
              {current.metadata.title}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted">
              {current.author.slice(0, 6)}…{current.author.slice(-4)}
            </p>
          </div>
        </div>
      </SwipeCard>

      {notification && (
        <div className="mt-4 rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft px-4 py-3 text-center text-sm font-semibold text-accent animate-pulse">
          {notification}
        </div>
      )}

      <div className="mt-6 flex gap-4">
        <button
          onClick={() => !isNfcBusy && handleSwipe("left", current)}
          disabled={isNfcBusy}
          className="btn-brutalist flex-1 justify-center border-danger py-3 text-danger"
        >
          ✕ Pass
        </button>
        <button
          onClick={() => !isNfcBusy && handleSwipe("right", current)}
          disabled={isNfcBusy}
          className="btn-brutalist btn-primary flex-1 justify-center py-3"
        >
          ♥ Support
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Swipe the card or tap the buttons, then tap your bracelet to confirm.
      </p>
    </main>
  );
}
