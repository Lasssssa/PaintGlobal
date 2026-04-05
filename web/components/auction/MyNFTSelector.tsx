"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud";

function ipfsToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://${GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

interface NftPreview {
  tokenId: bigint;
  name: string;
  imageUrl: string | null;
}

interface Props {
  ownerAddress: `0x${string}`;
  selectedTokenId: bigint | null;
  onSelect: (tokenId: bigint) => void;
}

/** Grille de petites images : clic = choisir le NFT à mettre en vente. */
export default function MyNFTSelector({ ownerAddress, selectedTokenId, onSelect }: Props) {
  const [previews, setPreviews] = useState<NftPreview[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState("");

  const { data: balanceBn } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: "balanceOf",
    args: [ownerAddress],
  });

  const balance = balanceBn !== undefined ? Number(balanceBn) : 0;

  const indexContracts = useMemo(
    () =>
      Array.from({ length: balance }, (_, i) => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_CONTRACT_ABI,
        functionName: "tokenOfOwnerByIndex" as const,
        args: [ownerAddress, BigInt(i)] as const,
      })),
    [ownerAddress, balance],
  );

  const { data: tokenIdReads } = useReadContracts({
    contracts: indexContracts,
    query: { enabled: balance > 0 },
  });

  const tokenIds = useMemo(() => {
    if (!tokenIdReads) return [];
    return tokenIdReads
      .map((r) => (r.result !== undefined ? (r.result as bigint) : null))
      .filter((id): id is bigint => id !== null);
  }, [tokenIdReads]);

  const uriContracts = useMemo(
    () =>
      tokenIds.map((id) => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_CONTRACT_ABI,
        functionName: "tokenURI" as const,
        args: [id] as const,
      })),
    [tokenIds],
  );

  const { data: uriReads } = useReadContracts({
    contracts: uriContracts,
    query: { enabled: tokenIds.length > 0 },
  });

  const loadPreviews = useCallback(async () => {
    if (balance === 0) {
      setPreviews([]);
      setLoadingMeta(false);
      return;
    }
    if (!uriReads || uriReads.length !== tokenIds.length) return;

    setLoadingMeta(true);
    setMetaError("");
    try {
      const items = await Promise.all(
        tokenIds.map(async (tokenId, i) => {
          const uri = uriReads[i]?.result as string | undefined;
          if (!uri) {
            return {
              tokenId,
              name: `NFT #${tokenId.toString()}`,
              imageUrl: null,
            } satisfies NftPreview;
          }
          try {
            const url = ipfsToHttp(uri);
            const res = await fetch(url);
            if (!res.ok) {
              return {
                tokenId,
                name: `NFT #${tokenId.toString()}`,
                imageUrl: null,
              } satisfies NftPreview;
            }
            const metadata = (await res.json()) as { name?: string; image?: string };
            const name =
              typeof metadata.name === "string" && metadata.name.trim()
                ? metadata.name.trim()
                : `NFT #${tokenId.toString()}`;
            const rawImage = metadata.image;
            const imageUrl =
              typeof rawImage === "string" && rawImage
                ? ipfsToHttp(rawImage)
                : null;
            return { tokenId, name, imageUrl } satisfies NftPreview;
          } catch {
            return {
              tokenId,
              name: `NFT #${tokenId.toString()}`,
              imageUrl: null,
            } satisfies NftPreview;
          }
        }),
      );
      setPreviews(items);
    } catch {
      setMetaError("Could not load NFT previews.");
      setPreviews(
        tokenIds.map((tokenId) => ({
          tokenId,
          name: `NFT #${tokenId.toString()}`,
          imageUrl: null,
        })),
      );
    } finally {
      setLoadingMeta(false);
    }
  }, [balance, uriReads, tokenIds]);

  useEffect(() => {
    loadPreviews();
  }, [loadPreviews]);

  const gridClass =
    "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5 md:gap-3";

  if (balanceBn === undefined) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square overflow-hidden rounded-[var(--radius-sm)] border-2 border-line"
          >
            <div className="skeleton h-full w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (balance === 0) {
    return (
      <div className="card-brutalist p-4 text-center">
        <p className="text-sm text-muted">No NFTs found for this bracelet.</p>
        <p className="mt-1 text-xs text-muted">
          Mint an NFT from an approved painting first.
        </p>
      </div>
    );
  }

  if (loadingMeta || !uriReads || uriReads.length !== tokenIds.length) {
    return (
      <div className={gridClass}>
        {tokenIds.map((id) => (
          <div
            key={id.toString()}
            className="aspect-square overflow-hidden rounded-[var(--radius-sm)] border-2 border-line"
          >
            <div className="skeleton h-full w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-xs font-semibold text-muted sm:text-left">
        Your NFTs — tap an image to sell that one
      </p>
      {metaError && (
        <p className="text-xs font-semibold text-danger">{metaError}</p>
      )}
      <div className={gridClass}>
        {previews.map((p) => {
          const isSelected = selectedTokenId === p.tokenId;
          return (
            <button
              key={p.tokenId.toString()}
              type="button"
              onClick={() => onSelect(p.tokenId)}
              title={`${p.name} · #${p.tokenId.toString()}`}
              aria-label={`Select NFT ${p.name}, token ${p.tokenId.toString()}`}
              aria-pressed={isSelected}
              className={`relative aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] border-2 transition-all ${
                isSelected
                  ? "border-accent shadow-[0_0_0_2px_var(--color-accent),2px_2px_0_var(--color-accent)] ring-2 ring-accent/30"
                  : "border-line shadow-[2px_2px_0_var(--color-line)] hover:z-[1] hover:border-accent/70 hover:shadow-[3px_3px_0_var(--color-line)] active:scale-[0.98]"
              }`}
              style={{
                WebkitTapHighlightColor: "transparent",
                background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)",
              }}
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-2xl text-muted sm:text-3xl">
                  🖼️
                </span>
              )}
              <span
                className={`pointer-events-none absolute bottom-1 left-1 rounded px-1 py-0.5 font-mono text-[0.6rem] font-bold leading-none sm:text-[0.65rem] ${
                  isSelected ? "bg-accent text-white" : "bg-black/55 text-white"
                }`}
              >
                #{p.tokenId.toString()}
              </span>
              {isSelected && (
                <span
                  className="pointer-events-none absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-md"
                  aria-hidden
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
