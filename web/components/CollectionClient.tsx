"use client";

import { useEffect, useState, useCallback, useMemo, useContext } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";
import { NfcIdentityContext } from "@/lib/nfc-context";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";

interface NftMetadata {
  name: string;
  description: string;
  image: string;
}

interface NftItem {
  tokenId: number;
  metadata: NftMetadata;
  imageUrl: string;
}

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud";

function ipfsToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://${GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

export default function CollectionClient() {
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcNote, setNfcNote] = useState("");
  const hasNfc = typeof window !== "undefined" && isNfcAvailable();

  const handleIdentityTap = async () => {
    try {
      setNfcScanning(true);
      setNfcNote("Tap your bracelet…");
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
          setNfcNote(
            evt.method === "credential"
              ? "Hold your iPhone near the bracelet…"
              : "Tap your bracelet…"
          );
        }
        if (evt.cause === "again") setNfcNote("Keep holding…");
        if (evt.cause === "retry") setNfcNote("Try again…");
        if (evt.cause === "scanned") setNfcNote("Scanned!");
      });
      setNfcAddress(sig.signerAddress);
      setNfcNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = "NFC scan failed.";
      if (name === "NFCMethodNotSupported") msg = "NFC is not supported on this device.";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied.";
      setNfcNote(msg);
    } finally {
      setNfcScanning(false);
    }
  };

  // ── Contract reads ──────────────────────────────────────────────────

  const { data: balanceBn } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: "balanceOf",
    args: nfcAddress ? [nfcAddress as `0x${string}`] : undefined,
    query: { enabled: !!nfcAddress },
  });

  const balance = balanceBn !== undefined ? Number(balanceBn) : 0;

  const indexContracts = useMemo(
    () =>
      nfcAddress
        ? Array.from({ length: balance }, (_, i) => ({
            address: NFT_CONTRACT_ADDRESS,
            abi: NFT_CONTRACT_ABI,
            functionName: "tokenOfOwnerByIndex" as const,
            args: [nfcAddress as `0x${string}`, BigInt(i)] as const,
          }))
        : [],
    [nfcAddress, balance],
  );

  const { data: tokenIdReads } = useReadContracts({
    contracts: indexContracts,
    query: { enabled: balance > 0 },
  });

  const tokenIds = useMemo(() => {
    if (!tokenIdReads) return [];
    return tokenIdReads
      .map((r) => (r.result !== undefined ? Number(r.result as bigint) : null))
      .filter((id): id is number => id !== null);
  }, [tokenIdReads]);

  const uriContracts = useMemo(
    () =>
      tokenIds.map((id) => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_CONTRACT_ABI,
        functionName: "tokenURI" as const,
        args: [BigInt(id)] as const,
      })),
    [tokenIds],
  );

  const { data: uriReads } = useReadContracts({
    contracts: uriContracts,
    query: { enabled: tokenIds.length > 0 },
  });

  // ── Fetch IPFS metadata ─────────────────────────────────────────────

  const loadNfts = useCallback(async () => {
    if (!nfcAddress) {
      setLoading(false);
      return;
    }
    if (balanceBn === undefined) return;
    if (balance === 0) {
      setNfts([]);
      setLoading(false);
      return;
    }
    if (!uriReads || uriReads.length !== tokenIds.length) return;

    setLoading(true);
    setError("");
    try {
      const items = await Promise.all(
        tokenIds.map(async (tokenId, i) => {
          const uri = uriReads[i]?.result as string | undefined;
          if (!uri) return null;

          const url = ipfsToHttp(uri);
          const res = await fetch(url);
          if (!res.ok) return null;
          const metadata = (await res.json()) as NftMetadata;
          const imageUrl = ipfsToHttp(metadata.image ?? "");

          return { tokenId, metadata, imageUrl } as NftItem;
        }),
      );
      setNfts(items.filter(Boolean) as NftItem[]);
    } catch {
      setError("Failed to load NFTs.");
    } finally {
      setLoading(false);
    }
  }, [nfcAddress, balanceBn, balance, uriReads, tokenIds]);

  useEffect(() => {
    loadNfts();
  }, [loadNfts]);

  // ── NFC identity screen (not yet scanned) ───────────────────────────

  if (!nfcAddress) {
    if (!hasNfc) {
      return (
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">My Collection</h1>
          <div className="empty-state py-16">
            <span className="mb-4 block text-4xl">📲</span>
            <p className="text-sm text-muted">An NFC bracelet is required to view your collection.</p>
          </div>
        </main>
      );
    }

    return (
      <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
        <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-ink">My Collection</h1>
        <p className="mb-10 text-sm text-muted">
          Tap your NFC bracelet to identify yourself and view your NFTs.
        </p>
        <div className="card-brutalist mx-auto flex max-w-md flex-col items-center gap-6 p-10">
          <span className="text-6xl">📲</span>
          <p className="text-base font-semibold text-ink">Tap your NFC bracelet to start</p>
          <button
            onClick={handleIdentityTap}
            disabled={nfcScanning}
            className="btn-brutalist btn-primary px-8 py-3 text-base"
          >
            {nfcScanning ? "Scanning…" : "Tap bracelet"}
          </button>
          {nfcNote && (
            <p className={`text-sm ${nfcNote.includes("failed") || nfcNote.includes("denied") || nfcNote.includes("not supported") ? "text-danger" : "text-accent animate-pulse"}`}>
              {nfcNote}
            </p>
          )}
        </div>
      </main>
    );
  }

  // ── Collection display (identified via NFC) ─────────────────────────

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">My Collection</h1>
      <p className="mb-6 text-sm text-muted">
        NFTs owned by{" "}
        <span className="font-mono">
          {nfcAddress.slice(0, 6)}…{nfcAddress.slice(-4)}
        </span>
      </p>

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="skeleton rounded-[var(--radius-base)]"
              style={{ aspectRatio: "4/3" }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && nfts.length === 0 && (
        <div className="empty-state">
          <span className="mb-3 block text-4xl">🖼️</span>
          <p className="text-base text-muted">No NFTs yet. Mint one from the gallery!</p>
        </div>
      )}

      {!loading && !error && nfts.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {nfts.map((nft) => (
            <div key={nft.tokenId} className="card-brutalist flex flex-col">
              <div className="relative border-b-2 border-line h-48 overflow-hidden">
                {nft.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={nft.imageUrl}
                    alt={nft.metadata.name}
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
                  #{nft.tokenId}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <h3 className="text-lg font-bold tracking-[-0.02em] text-ink line-clamp-1">
                  {nft.metadata.name}
                </h3>
                {nft.metadata.description && (
                  <p className="text-sm text-muted line-clamp-2">{nft.metadata.description}</p>
                )}
                <div className="mt-1 space-y-0.5">
                  <p className="truncate font-mono text-xs text-muted">
                    <span className="font-semibold text-ink/60">Contract</span>{" "}
                    {NFT_CONTRACT_ADDRESS.slice(0, 6)}…{NFT_CONTRACT_ADDRESS.slice(-4)}
                  </p>
                  <p className="font-mono text-xs text-muted">
                    <span className="font-semibold text-ink/60">Token ID</span>{" "}
                    {nft.tokenId}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
