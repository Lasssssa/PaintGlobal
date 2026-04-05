"use client";

import { useState, useContext, useRef, useEffect } from "react";
import { useReadContract } from "wagmi";
import { fetchImageUrl, type PaintingMetadata } from "@/lib/storage";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";
import { NfcIdentityContext } from "@/lib/nfc-context";

interface Props {
  paintingId: number;
  metadata: PaintingMetadata;
  voteCount: number;
  /** Clic sur la vignette → lightbox (galerie). */
  onImageClick?: (payload: { src: string; title: string }) => void;
}

async function uploadNftMetadata(title: string, imageCID: string): Promise<string> {
  const nftMeta = {
    name: title,
    description: "Created on PaintGlobal",
    image: `ipfs://${imageCID}`,
  };
  const file = new File([JSON.stringify(nftMeta)], "nft-metadata.json", {
    type: "application/json",
  });
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to upload NFT metadata");
  const { cid } = (await res.json()) as { cid: string };
  return cid;
}

type MintStep = "idle" | "uploading" | "nfc-signing" | "submitting" | "error";

export default function PaintingCard({ paintingId, metadata, voteCount, onImageClick }: Props) {
  const imgSrc = fetchImageUrl(metadata.imageCID);
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);

  const [mintStep, setMintStep] = useState<MintStep>("idle");
  const [mintNote, setMintNote] = useState("");

  const isAuthor =
    !!nfcAddress &&
    nfcAddress.toLowerCase() === metadata.author.toLowerCase();

  // justMinted : flag local pour cacher le bouton immédiatement après le mint,
  // sans attendre la confirmation on-chain (latence réseau).
  const [justMinted, setJustMinted] = useState(false);
  const [mintSuccessToast, setMintSuccessToast] = useState(false);
  const mintToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (mintToastTimer.current) clearTimeout(mintToastTimer.current);
    };
  }, []);

  const { data: alreadyMinted, refetch: refetchMinted } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: "paintingMinted",
    args: [BigInt(paintingId)],
  });

  const handleMint = async () => {
    if (!isNfcAvailable()) {
      setMintNote("NFC not available on this device");
      const t = setTimeout(() => setMintNote(""), 4000);
      return () => clearTimeout(t);
    }

    setMintStep("uploading");
    setMintNote("");

    try {
      const cid = await uploadNftMetadata(metadata.title, metadata.imageCID);
      const uri = `ipfs://${cid}`;

      setMintStep("nfc-signing");
      setMintNote("Tap your bracelet…");

      const hexPayload = Array.from(new TextEncoder().encode(cid.slice(0, 32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const sig = await signWithNfc(hexPayload, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
          setMintNote(
            evt.method === "credential"
              ? "Hold your iPhone near the bracelet…"
              : "Tap your bracelet…"
          );
        }
        if (evt.cause === "again") setMintNote("Keep holding…");
        if (evt.cause === "retry") setMintNote("Try again…");
        if (evt.cause === "scanned") setMintNote("Scanned!");
      });

      // Always update nfcAddress with the actual signer from this tap.
      setNfcAddress(sig.signerAddress);

      // Guard: the bracelet just tapped must be the painting's author.
      // Catches the "wrong bracelet" case before wasting a relay call.
      if (sig.signerAddress.toLowerCase() !== metadata.author.toLowerCase()) {
        throw new Error("Wrong bracelet — this painting belongs to a different bracelet");
      }

      setMintStep("submitting");
      setMintNote("Minting on-chain…");

      const res = await fetch("/api/nfc/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paintingId,
          uri,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${hexPayload}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mint relay failed");

      setMintStep("idle");
      setMintNote("");
      setJustMinted(true);
      refetchMinted();
      if (mintToastTimer.current) clearTimeout(mintToastTimer.current);
      setMintSuccessToast(true);
      mintToastTimer.current = setTimeout(() => {
        setMintSuccessToast(false);
        mintToastTimer.current = null;
      }, 4500);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = err instanceof Error ? err.message : "Mint failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported on this device";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      else if (msg.includes("Wrong bracelet")) msg = "Wrong bracelet — use the bracelet that submitted this painting";
      else if (msg.includes("not the author")) msg = "Only the author can mint this painting";
      else if (msg.includes("already minted")) msg = "This painting has already been minted";
      setMintStep("error");
      setMintNote(msg.slice(0, 150));
      setTimeout(() => {
        setMintStep("idle");
        setMintNote("");
      }, 5000);
    }
  };

  const busy = mintStep !== "idle" && mintStep !== "error";

  const buttonLabel: Record<MintStep, string> = {
    idle: "Mint NFT",
    uploading: "Uploading…",
    "nfc-signing": "Waiting for NFC…",
    submitting: "Minting…",
    error: "Try again",
  };

  // Cache le bouton si: déjà minté on-chain OU vient d'être minté localement
  const showMintButton = isAuthor && !alreadyMinted && !justMinted;

  return (
    <div className="card-brutalist flex flex-col">
      <div className="relative h-48 overflow-hidden border-b-2 border-line">
        {imgSrc ? (
          onImageClick ? (
            <button
              type="button"
              onClick={() => onImageClick({ src: imgSrc, title: metadata.title })}
              className="absolute inset-0 block h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              aria-label={`View “${metadata.title}” full size`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt=""
                className="pointer-events-none h-full w-full object-cover"
                aria-hidden
              />
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={metadata.title}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div
            className="flex h-full items-center justify-center text-4xl text-muted"
            style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
          >
            🖼️
          </div>
        )}

        <span className="count-pill pointer-events-none absolute right-3 top-2.5 z-[1]">
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

        {showMintButton && !busy && (
          <button
            type="button"
            onClick={handleMint}
            className="btn-brutalist btn-primary mt-1 w-full text-sm"
          >
            Mint NFT
          </button>
        )}

        {busy && (
          <div className="mt-1 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border-2 border-line py-2 text-xs font-semibold text-muted">
            <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            {buttonLabel[mintStep]}
          </div>
        )}

        {mintStep === "error" && mintNote && (
          <p className="text-xs font-semibold text-danger">{mintNote}</p>
        )}
      </div>

      {mintSuccessToast && (
        <div
          className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[100] w-[min(92vw,20rem)] -translate-x-1/2 rounded-[var(--radius-base)] border-2 border-line bg-paper px-4 py-3 text-center text-sm font-semibold text-ink shadow-[4px_4px_0_var(--color-line)] sm:bottom-8"
          role="status"
          aria-live="polite"
        >
          NFT minted successfully.
        </div>
      )}
    </div>
  );
}
