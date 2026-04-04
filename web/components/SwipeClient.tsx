"use client";

import { useState, useEffect, useCallback, useMemo, useContext, useRef } from "react";
import type { ReactNode, PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReadContract, useReadContracts } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACT_ADDRESS, CONTRACT_ABI, PAINTING_STATUS } from "@/lib/contract";
import { fetchMetadata, fetchImageUrl, type PaintingMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, encodeBatchVoteMessage, type NfcStatusEvent } from "@/lib/nfc";
import { NfcIdentityContext } from "@/lib/nfc-context";

// ── Swipe card (pointer-events, no external dependency) ───────────────────────

const SWIPE_THRESHOLD = 80;

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
        cardRef.current.style.transition = "transform 0.3s ease";
        cardRef.current.style.transform = `translateX(${dir === "right" ? 600 : -600}px) rotate(${dir === "right" ? 25 : -25}deg)`;
      }
      setTimeout(() => onSwipe(dir), 300);
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

type Phase = "nfc-unavailable" | "identity" | "loading" | "swiping" | "all-swiped" | "error";
type SaveStatus = "idle" | "scanning" | "submitting" | "done" | "error";

interface SwipePainting {
  id: number;
  author: `0x${string}`;
  metadata: PaintingMetadata;
}

interface PendingVote {
  paintingId: number;
  support: boolean;
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

// ── Card content (shared between top and background card) ─────────────────────

function CardContent({ painting }: { painting: SwipePainting }) {
  return (
    <div className="card-brutalist w-full">
      <div className="relative border-b-2 border-line" style={{ aspectRatio: "4/3" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fetchImageUrl(painting.metadata.imageCID)}
          alt={painting.metadata.title}
          className="h-full w-full object-cover"
          draggable={false}
        />
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
          {painting.metadata.title}
        </h2>
        <p className="mt-1 font-mono text-xs text-muted">
          {painting.author.slice(0, 6)}…{painting.author.slice(-4)}
        </p>
      </div>
    </div>
  );
}

const CANNES_BG = "https://ethglobal.b-cdn.net/events/cannes2026/images/ap57a/default.jpg";

// ── Main component ────────────────────────────────────────────────────────────

export default function SwipeClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const [phase, setPhase] = useState<Phase>("identity");
  const [paintings, setPaintings] = useState<SwipePainting[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingVotes, setPendingVotes] = useState<PendingVote[]>([]);
  const [nfcStatus, setNfcStatus] = useState<"idle" | "identity-scan">("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [notification, setNotification] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const available = isNfcAvailable();
    if (!available) {
      setPhase("nfc-unavailable");
    } else if (nfcAddress) {
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

  // ── Load unswiped paintings ─────────────────────────────────────────────────

  const loadPaintings = useCallback(async () => {
    if (!nfcAddress) return;
    if (countBn === undefined) return;
    if (
      n > 0 &&
      (paintingReads === undefined ||
        hasVotedReads === undefined ||
        hasVotedNegativeReads === undefined)
    )
      return;

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
      setPhase(results.length === 0 ? "all-swiped" : "swiping");
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

  // ── Local swipe (no NFC, just queue) ───────────────────────────────────────

  const handleSwipe = useCallback((dir: "left" | "right", painting: SwipePainting) => {
    setPendingVotes((prev) => [...prev, { paintingId: painting.id, support: dir === "right" }]);
    setCurrentIndex((prev) => {
      const next = prev + 1;
      return next;
    });
  }, []);

  // Update phase once all paintings have been swiped
  useEffect(() => {
    if (phase === "swiping" && paintings.length > 0 && currentIndex >= paintings.length) {
      setPhase("all-swiped");
    }
  }, [currentIndex, paintings.length, phase]);

  // ── Save preferences (one NFC tap, one batch tx) ───────────────────────────

  const handleSave = async () => {
    if (pendingVotes.length === 0) return;
    try {
      setSaveStatus("scanning");
      setNotification("Tap your bracelet to save…");

      const batchMessage = encodeBatchVoteMessage(
        pendingVotes.map(({ paintingId, support }) => ({ id: paintingId, support }))
      );

      const sig = await signWithNfc(batchMessage, (evt: NfcStatusEvent) => {
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

      setSaveStatus("submitting");
      setNotification("Recording on-chain…");

      const res = await fetch("/api/nfc/vote-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          votes: pendingVotes,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${batchMessage}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setSaveStatus("done");
      setNotification("Votes saved!");
      // Invalider tout le cache wagmi : force un refetch de hasVoted/hasVotedNegative
      // au prochain montage de SwipeClient → les items déjà votés n'apparaissent plus.
      await queryClient.invalidateQueries();
      setTimeout(() => router.push("/"), 2000);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = err instanceof Error ? err.message : "Save failed";
      if (name === "NFCMethodNotSupported") msg = "NFC is not supported on this device.";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied.";
      else if (msg.includes("already voted")) msg = "Some paintings were already voted on.";
      setSaveStatus("error");
      setNotification(msg.slice(0, 150));
    }
  };

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

  if (phase === "all-swiped") {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">All reviewed!</h1>
        <p className="mb-8 text-sm text-muted">
          {pendingVotes.length > 0
            ? `You have ${pendingVotes.length} vote${pendingVotes.length !== 1 ? "s" : ""} ready to save.`
            : "No new votes to save."}
        </p>

        {pendingVotes.length > 0 && (
          <div className="card-brutalist flex flex-col items-center gap-5 p-8">
            <span className="text-5xl">🗳️</span>
            <p className="text-base font-semibold text-ink">
              {pendingVotes.filter((v) => v.support).length} support ·{" "}
              {pendingVotes.filter((v) => !v.support).length} pass
            </p>

            {saveStatus === "idle" || saveStatus === "error" ? (
              <button
                onClick={handleSave}
                className="btn-brutalist btn-primary w-full justify-center py-3 text-base"
              >
                Save my preferences ({pendingVotes.length})
              </button>
            ) : saveStatus === "scanning" || saveStatus === "submitting" ? (
              <div className="flex flex-col items-center gap-3">
                <span className="text-sm text-accent animate-pulse font-semibold">{notification}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                ✓ {notification}
              </div>
            )}

            {saveStatus === "error" && notification && (
              <p className="text-sm text-danger">{notification}</p>
            )}
          </div>
        )}

        {pendingVotes.length === 0 && (
          <Link href="/" className="btn-brutalist btn-primary no-underline">
            Back to Gallery
          </Link>
        )}
      </main>
    );
  }

  // ── Swiping phase ───────────────────────────────────────────────────────────

  const stack = paintings.slice(currentIndex, currentIndex + 2);

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8" style={{ position: "relative" }}>
      {/* Peinture impressionniste en fond subtil */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url(${CANNES_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          opacity: 0.10,
          zIndex: -1,
          pointerEvents: "none",
        }}
      />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink">Swipe to Vote</h1>
        <span className="text-sm text-muted">
          {currentIndex + 1} / {paintings.length}
        </span>
      </div>

      {/* Card stack — current on top, next pre-rendered behind */}
      <div className="relative" style={{ minHeight: "420px" }}>
        {stack.map((painting, stackIdx) => {
          const isTop = stackIdx === 0;
          return (
            <div
              key={painting.id}
              className="absolute inset-0"
              style={{
                zIndex: isTop ? 2 : 1,
                transform: isTop ? "scale(1) translateY(0)" : "scale(0.97) translateY(10px)",
                transition: "transform 0.3s ease",
                pointerEvents: isTop ? "auto" : "none",
              }}
            >
              {isTop ? (
                <SwipeCard onSwipe={(dir) => handleSwipe(dir, painting)}>
                  <CardContent painting={painting} />
                </SwipeCard>
              ) : (
                <CardContent painting={painting} />
              )}
            </div>
          );
        })}
      </div>

      {/* Manual buttons */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => stack[0] && handleSwipe("left", stack[0])}
          className="btn-brutalist flex-1 justify-center border-danger py-3 text-danger"
        >
          ✕ Pass
        </button>
        <button
          onClick={() => stack[0] && handleSwipe("right", stack[0])}
          className="btn-brutalist btn-primary flex-1 justify-center py-3"
        >
          ♥ Support
        </button>
      </div>

      {/* Persistent save bar when there are pending votes */}
      {pendingVotes.length > 0 && saveStatus === "idle" && (
        <div className="mt-5 flex items-center justify-between rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft px-4 py-3">
          <span className="text-sm font-semibold text-accent">
            {pendingVotes.length} vote{pendingVotes.length !== 1 ? "s" : ""} pending
          </span>
          <button onClick={handleSave} className="btn-brutalist text-sm py-1.5 px-4">
            Save my preferences
          </button>
        </div>
      )}

      {saveStatus !== "idle" && saveStatus !== "error" && notification && (
        <div className="mt-5 rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft px-4 py-3 text-center text-sm font-semibold text-accent animate-pulse">
          {notification}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        Swipe or tap buttons · tap NFC once when ready to save
      </p>
    </main>
  );
}
