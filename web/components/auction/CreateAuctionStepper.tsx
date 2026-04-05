"use client";

import { useState, useContext, useEffect } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { NfcIdentityContext } from "@/lib/nfc-context";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";
import {
  AUCTION_CONTRACT_ADDRESS,
  AUCTION_CONTRACT_ABI,
  encodeApproveMessage,
  encodeAuctionMessage,
} from "@/lib/auction-contract";
import { NFT_CONTRACT_ADDRESS } from "@/lib/nft-contract";
import MyNFTSelector from "./MyNFTSelector";

const DURATIONS = [
  { label: "1 minute", value: 60 },
  { label: "3 minutes", value: 180 },
  { label: "1 hour",  value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours",value: 86400 },
  { label: "7 days",  value: 604800 },
];

type Step =
  | "identity"        // tap bracelet to get nfcAddress
  | "connect-wallet"  // connect WalletConnect wallet (payerWallet)
  | "select-nft"      // choose which NFT to auction
  | "set-params"      // price + duration
  | "tap-approve"     // NFC tap 1: sign approve message
  | "tap-auction"     // NFC tap 2: sign auction creation message
  | "submitting"      // waiting for on-chain confirmation
  | "done"            // auction created
  | "error";          // something went wrong

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function CreateAuctionStepper() {
  const router = useRouter();
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const { address: walletAddress, isConnected } = useAccount();

  const [step, setStep] = useState<Step>(nfcAddress ? "connect-wallet" : "identity");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [startPriceStr, setStartPriceStr] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(86400);

  // Saved signatures from the two NFC taps
  const [approveSig, setApproveSig] = useState<{
    v: number; r: string; s: string; hash: string; message: string;
  } | null>(null);

  const [auctionId, setAuctionId] = useState<string | null>(null);

  // Read nonce from contract for the bracelet address
  const { data: nonce } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "nonces",
    args: nfcAddress ? [nfcAddress as `0x${string}`] : undefined,
    query: { enabled: !!nfcAddress },
  });

  const hasNfc = typeof window !== "undefined" && isNfcAvailable();

  // Wallet connecté → enchaîner tout de suite sur le choix du NFT (sans bouton « Continue »).
  useEffect(() => {
    if (step === "connect-wallet" && isConnected && walletAddress) {
      setStep("select-nft");
    }
  }, [step, isConnected, walletAddress]);

  // ── Step: identity ────────────────────────────────────────────────────────

  const handleIdentityTap = async () => {
    setNote("Tap your bracelet…");
    try {
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setNote("Keep holding…");
        if (evt.cause === "retry") setNote("Try again…");
        if (evt.cause === "scanned") setNote("Scanned!");
      });
      setNfcAddress(sig.signerAddress);
      setNote("");
      setStep("connect-wallet");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = "NFC scan failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported on this device";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      setNote(msg);
    }
  };

  // ── Step: tap-approve ─────────────────────────────────────────────────────

  const handleTapApprove = async () => {
    if (selectedTokenId === null) return;
    setNote("Tap your bracelet to authorize the NFT transfer…");

    const hexMessage = encodeApproveMessage(selectedTokenId, AUCTION_CONTRACT_ADDRESS);

    try {
      const sig = await signWithNfc(hexMessage, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setNote("Keep holding…");
        if (evt.cause === "retry") setNote("Try again…");
        if (evt.cause === "scanned") setNote("Signed! Now tap again for auction creation…");
      });
      setApproveSig({ ...sig, message: `0x${hexMessage}` });
      setNote("First signature captured. Ready for auction creation tap.");
      setStep("tap-auction");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = err instanceof Error ? err.message : "NFC failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      setNote(msg);
    }
  };

  // ── Step: tap-auction ─────────────────────────────────────────────────────

  const handleTapAuction = async () => {
    if (selectedTokenId === null || !walletAddress || !approveSig || nonce === undefined) return;

    const startPrice = parseEther(startPriceStr || "0");
    if (startPrice === BigInt(0)) {
      setErrorMsg("Start price must be greater than 0");
      setStep("set-params");
      return;
    }

    setNote("Tap your bracelet to sign the auction creation…");

    const hexMessage = encodeAuctionMessage(
      selectedTokenId,
      walletAddress as `0x${string}`,
      startPrice,
      BigInt(durationSeconds),
      nonce as bigint
    );

    try {
      const sig = await signWithNfc(hexMessage, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setNote("Keep holding…");
        if (evt.cause === "retry") setNote("Try again…");
        if (evt.cause === "scanned") setNote("Signed! Submitting on-chain…");
      });

      setStep("submitting");
      setNote("Submitting auction on-chain…");

      const res = await fetch("/api/nfc/create-auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: selectedTokenId.toString(),
          payerWallet: walletAddress,
          startPrice: startPrice.toString(),
          durationSeconds: durationSeconds.toString(),
          nonce: (nonce as bigint).toString(),
          // Approve sig
          approveV: approveSig.v,
          approveR: approveSig.r,
          approveS: approveSig.s,
          approveHash: approveSig.hash,
          approveMessage: approveSig.message,
          // Auction sig
          auctionV: sig.v,
          auctionR: sig.r,
          auctionS: sig.s,
          auctionHash: sig.hash,
          auctionMessage: `0x${hexMessage}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setAuctionId(data.auctionId);
      setStep("done");
      setNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = err instanceof Error ? err.message : "Failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      setErrorMsg(msg);
      setStep("error");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hasNfc && step === "identity") {
    return (
      <div className="empty-state py-16">
        <span className="mb-4 block text-4xl">📲</span>
        <p className="text-sm text-muted">An NFC bracelet is required to create an auction.</p>
      </div>
    );
  }

  if (step === "identity") {
    return (
      <div className="card-brutalist mx-auto flex max-w-md flex-col items-center gap-6 p-10">
        <span className="text-6xl">📲</span>
        <p className="text-base font-semibold text-ink text-center">
          Tap your NFC bracelet to identify yourself
        </p>
        <button
          onClick={handleIdentityTap}
          className="btn-brutalist btn-primary px-8 py-3 text-base"
        >
          Tap bracelet
        </button>
        {note && (
          <p className="text-sm text-accent animate-pulse text-center">{note}</p>
        )}
      </div>
    );
  }

  if (step === "connect-wallet") {
    return (
      <div className="card-brutalist mx-auto flex max-w-md flex-col items-center gap-6 p-10">
        <span className="text-5xl">💳</span>
        <p className="text-base font-semibold text-ink text-center">
          Connect the wallet that will receive auction proceeds
        </p>
        <p className="text-sm text-muted text-center">
          Bracelet: <span className="font-mono">{nfcAddress?.slice(0,6)}…{nfcAddress?.slice(-4)}</span>
        </p>
        <ConnectButton />
        {isConnected && walletAddress && (
          <p className="text-sm text-muted text-center">
            Proceeds wallet:{" "}
            <span className="font-mono font-semibold text-ink">
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
          </p>
        )}
      </div>
    );
  }

  if (step === "select-nft") {
    return (
      <div className="card-brutalist mx-auto flex w-full max-w-xl flex-col gap-5 p-6 sm:max-w-2xl sm:p-8">
        <h2 className="text-lg font-bold text-ink">Pick an NFT to sell</h2>
        <MyNFTSelector
          ownerAddress={nfcAddress as `0x${string}`}
          selectedTokenId={selectedTokenId}
          onSelect={(tokenId) => {
            setSelectedTokenId(tokenId);
            setStep("set-params");
          }}
        />
      </div>
    );
  }

  if (step === "set-params") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col gap-5 p-8">
        <h2 className="text-lg font-bold text-ink">Auction parameters</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">
            Starting price (USDC)
          </label>
          <input
            type="number"
            step="any"
            min="0.01"
            value={startPriceStr}
            onChange={(e) => {
              setStartPriceStr(e.target.value);
              setErrorMsg("");
            }}
            placeholder="e.g. 1.0"
            className="input-brutalist font-mono"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">
            Duration
          </label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDurationSeconds(d.value)}
                className={`border-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold transition-colors ${
                  durationSeconds === d.value
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-paper text-ink hover:border-accent"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && <p className="text-xs text-danger font-semibold">{errorMsg}</p>}

        <div className="text-xs text-muted space-y-0.5">
          <p>NFT: <span className="font-mono font-semibold text-ink">#{selectedTokenId?.toString()}</span></p>
          <p>Proceeds go to: <span className="font-mono font-semibold text-ink">{walletAddress?.slice(0,6)}…{walletAddress?.slice(-4)}</span></p>
        </div>

        <button
          type="button"
          onClick={() => setStep("select-nft")}
          className="w-full text-center text-sm font-semibold text-muted underline decoration-2 underline-offset-2 hover:text-ink"
        >
          Change NFT
        </button>

        <button
          onClick={() => {
            if (!startPriceStr || parseFloat(startPriceStr) <= 0) {
              setErrorMsg("Enter a valid starting price");
              return;
            }
            setStep("tap-approve");
          }}
          className="btn-brutalist btn-primary w-full"
        >
          Continue
        </button>
      </div>
    );
  }

  if (step === "tap-approve") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col items-center gap-6 p-10">
        <span className="text-5xl">🔑</span>
        <p className="text-base font-semibold text-ink text-center">
          Tap 1 of 2 — Authorize NFT transfer
        </p>
        <p className="text-sm text-muted text-center">
          Your bracelet will sign permission for the auction contract to hold your NFT.
        </p>
        <button
          onClick={handleTapApprove}
          className="btn-brutalist btn-primary px-8 py-3 text-base w-full"
        >
          Tap bracelet
        </button>
        {note && (
          <p className="text-sm text-accent animate-pulse text-center">{note}</p>
        )}
      </div>
    );
  }

  if (step === "tap-auction") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col items-center gap-6 p-10">
        <span className="text-5xl">🏷️</span>
        <p className="text-base font-semibold text-ink text-center">
          Tap 2 of 2 — Create auction
        </p>
        <p className="text-sm text-muted text-center">
          Your bracelet will sign the auction parameters and submit on-chain.
        </p>
        <div className="text-xs text-muted space-y-0.5 w-full">
          <p>NFT: <span className="font-mono font-semibold text-ink">#{selectedTokenId?.toString()}</span></p>
          <p>Start: <span className="font-mono font-semibold text-ink">{startPriceStr} USDC</span></p>
          <p>Duration: <span className="font-semibold text-ink">{DURATIONS.find(d => d.value === durationSeconds)?.label}</span></p>
          <p>Proceeds to: <span className="font-mono font-semibold text-ink">{walletAddress?.slice(0,6)}…{walletAddress?.slice(-4)}</span></p>
        </div>
        <button
          onClick={handleTapAuction}
          className="btn-brutalist btn-primary px-8 py-3 text-base w-full"
        >
          Tap bracelet
        </button>
        {note && (
          <p className="text-sm text-accent animate-pulse text-center">{note}</p>
        )}
      </div>
    );
  }

  if (step === "submitting") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col items-center gap-6 p-10">
        <div className="flex h-14 w-14 items-center justify-center">
          <Spinner />
        </div>
        <p className="text-base font-semibold text-ink text-center">
          Submitting on-chain…
        </p>
        {note && <p className="text-sm text-muted text-center">{note}</p>}
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col items-center gap-6 p-10">
        <span className="text-6xl">🎉</span>
        <p className="text-2xl font-bold text-ink text-center">Auction created!</p>
        {auctionId && (
          <button
            onClick={() => router.push(`/auctions/${auctionId}`)}
            className="btn-brutalist btn-primary px-8 py-3 text-base w-full"
          >
            View auction
          </button>
        )}
        <button
          onClick={() => router.push("/auctions")}
          className="btn-brutalist w-full"
        >
          Browse auctions
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="card-brutalist mx-auto max-w-md flex flex-col items-center gap-6 p-10">
        <span className="text-5xl">⚠️</span>
        <p className="text-base font-semibold text-ink text-center">Something went wrong</p>
        <p className="text-sm text-danger text-center">{errorMsg}</p>
        <button
          onClick={() => {
            setErrorMsg("");
            setStep("set-params");
          }}
          className="btn-brutalist btn-primary px-8 py-3 text-base w-full"
        >
          Try again
        </button>
      </div>
    );
  }

  return null;
}
