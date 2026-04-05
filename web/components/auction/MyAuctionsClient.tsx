"use client";

import { useState, useContext, useMemo } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import {
  AUCTION_CONTRACT_ADDRESS,
  AUCTION_CONTRACT_ABI,
  encodeCancelMessage,
  type AuctionData,
} from "@/lib/auction-contract";
import { NfcIdentityContext } from "@/lib/nfc-context";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";
import CountdownTimer from "./CountdownTimer";

type CancelStep = "idle" | "signing" | "submitting" | "done" | "error";

function useCancelAuction(auctionId: number, onSuccess: () => void) {
  const [step, setStep] = useState<CancelStep>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const cancel = async () => {
    setStep("signing");
    setNote("Tap your bracelet to cancel the auction…");
    setError("");

    const hexMessage = encodeCancelMessage(BigInt(auctionId));

    try {
      const sig = await signWithNfc(hexMessage, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setNote("Keep holding…");
        if (evt.cause === "retry") setNote("Try again…");
        if (evt.cause === "scanned") setNote("Signed! Submitting…");
      });

      setStep("submitting");
      setNote("Cancelling on-chain…");

      const res = await fetch("/api/nfc/cancel-auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionId: auctionId.toString(),
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${hexMessage}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setStep("done");
      setNote("Auction cancelled.");
      onSuccess();
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Cancellation failed";
      setError(msg);
      setStep("error");
      setTimeout(() => { setStep("idle"); setError(""); }, 5000);
    }
  };

  return { step, note, error, cancel };
}

function AuctionRow({
  auctionId,
  auction,
  onCancelled,
}: {
  auctionId: number;
  auction: AuctionData;
  onCancelled: () => void;
}) {
  const { step, note, error, cancel } = useCancelAuction(auctionId, onCancelled);
  const now = Math.floor(Date.now() / 1000);
  const ended = Number(auction.endTime) <= now;
  const hasBids = auction.highestBidder !== "0x0000000000000000000000000000000000000000";
  const canCancel = !auction.finalized && !hasBids && !ended;

  let status = "Live";
  let statusClass = "text-accent";
  if (auction.finalized) { status = "Finalized"; statusClass = "text-muted"; }
  else if (ended) { status = "Ended"; statusClass = "text-danger"; }

  return (
    <div className="card-brutalist p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href={`/auctions/${auctionId}`}
          className="font-bold text-ink hover:text-accent transition-colors"
        >
          NFT #{auction.tokenId.toString()}
        </Link>
        <span className={`text-xs font-semibold ${statusClass}`}>{status}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted">Start price</p>
          <p className="font-semibold text-ink">{formatEther(auction.startPrice)} USDC</p>
        </div>
        <div>
          <p className="text-muted">{hasBids ? "Current bid" : "No bids"}</p>
          {hasBids && (
            <p className="font-semibold text-ink">{formatEther(auction.highestBid)} USDC</p>
          )}
        </div>
        <div>
          <p className="text-muted">Time</p>
          {ended ? (
            <p className="text-danger font-semibold">Ended</p>
          ) : (
            <CountdownTimer endTime={auction.endTime} />
          )}
        </div>
        <div>
          <p className="text-muted">Proceeds to</p>
          <p className="font-mono text-ink">
            {auction.payerWallet.slice(0,6)}…{auction.payerWallet.slice(-4)}
          </p>
        </div>
      </div>

      {canCancel && (
        <div className="flex flex-col gap-1">
          <button
            onClick={cancel}
            disabled={step !== "idle"}
            className="btn-brutalist text-sm w-full"
          >
            {step === "signing" || step === "submitting" ? "Cancelling…" : "Cancel Auction"}
          </button>
          {note && <p className="text-xs text-accent animate-pulse">{note}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function MyAuctionsClient() {
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcNote, setNfcNote] = useState("");
  const hasNfc = typeof window !== "undefined" && isNfcAvailable();

  const handleIdentityTap = async () => {
    setNfcScanning(true);
    setNfcNote("Tap your bracelet…");
    try {
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setNfcNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setNfcNote("Keep holding…");
        if (evt.cause === "retry") setNfcNote("Try again…");
        if (evt.cause === "scanned") setNfcNote("Scanned!");
      });
      setNfcAddress(sig.signerAddress);
      setNfcNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = "NFC scan failed.";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported.";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied.";
      setNfcNote(msg);
    } finally {
      setNfcScanning(false);
    }
  };

  const { data: countBn, refetch: refetchCount } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "auctionCount",
    query: { refetchInterval: 15_000 },
  });

  const count = countBn !== undefined ? Number(countBn) : 0;

  const auctionContracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: AUCTION_CONTRACT_ADDRESS,
        abi: AUCTION_CONTRACT_ABI,
        functionName: "getAuction" as const,
        args: [BigInt(i)] as const,
      })),
    [count]
  );

  const { data: auctionReads, refetch: refetchAuctions } = useReadContracts({
    contracts: auctionContracts,
    query: { enabled: count > 0 && !!nfcAddress, refetchInterval: 15_000 },
  });

  const myAuctions = useMemo(() => {
    if (!nfcAddress || !auctionReads) return [];
    return auctionReads
      .map((r, i) =>
        r.result ? { id: i, auction: r.result as unknown as AuctionData } : null
      )
      .filter(
        (a): a is { id: number; auction: AuctionData } =>
          a !== null &&
          a.auction.seller.toLowerCase() === nfcAddress.toLowerCase()
      );
  }, [auctionReads, nfcAddress]);

  const refetchAll = () => { refetchCount(); refetchAuctions(); };

  // Not yet identified
  if (!nfcAddress) {
    if (!hasNfc) {
      return (
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">My Auctions</h1>
          <div className="empty-state py-16">
            <span className="mb-4 block text-4xl">📲</span>
            <p className="text-sm text-muted">An NFC bracelet is required to view your auctions.</p>
          </div>
        </main>
      );
    }
    return (
      <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">My Auctions</h1>
        <p className="mb-10 text-sm text-muted">Tap your bracelet to see auctions you created.</p>
        <div className="card-brutalist mx-auto flex max-w-md flex-col items-center gap-6 p-10">
          <span className="text-6xl">📲</span>
          <button
            onClick={handleIdentityTap}
            disabled={nfcScanning}
            className="btn-brutalist btn-primary px-8 py-3 text-base"
          >
            {nfcScanning ? "Scanning…" : "Tap bracelet"}
          </button>
          {nfcNote && <p className="text-sm text-accent animate-pulse text-center">{nfcNote}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">My Auctions</h1>
          <p className="text-sm text-muted mt-1">
            Bracelet{" "}
            <span className="font-mono">
              {nfcAddress.slice(0,6)}…{nfcAddress.slice(-4)}
            </span>
          </p>
        </div>
        <Link href="/auctions/create" className="btn-brutalist btn-primary px-5 py-2 text-sm">
          + New Auction
        </Link>
      </div>

      {countBn === undefined && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-[var(--radius-base)]" style={{ height: 180 }} />
          ))}
        </div>
      )}

      {countBn !== undefined && myAuctions.length === 0 && (
        <div className="empty-state py-16">
          <span className="mb-3 block text-4xl">🏷️</span>
          <p className="text-base text-muted">No auctions from this bracelet yet.</p>
          <Link href="/auctions/create" className="btn-brutalist btn-primary mt-4 inline-block px-6 py-2">
            Create auction
          </Link>
        </div>
      )}

      {myAuctions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {myAuctions.map(({ id, auction }) => (
            <AuctionRow
              key={id}
              auctionId={id}
              auction={auction}
              onCancelled={refetchAll}
            />
          ))}
        </div>
      )}
    </main>
  );
}
