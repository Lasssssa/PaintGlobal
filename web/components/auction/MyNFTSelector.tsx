"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";

interface Props {
  ownerAddress: `0x${string}`;
  selectedTokenId: bigint | null;
  onSelect: (tokenId: bigint) => void;
}

export default function MyNFTSelector({ ownerAddress, selectedTokenId, onSelect }: Props) {
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
    [ownerAddress, balance]
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

  if (balanceBn === undefined) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton h-16 w-16 rounded-[var(--radius-sm)]"
          />
        ))}
      </div>
    );
  }

  if (balance === 0) {
    return (
      <div className="card-brutalist p-4 text-center">
        <p className="text-sm text-muted">No NFTs found for this bracelet.</p>
        <p className="text-xs text-muted mt-1">
          Mint an NFT from an approved painting first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {tokenIds.map((tokenId) => {
        const isSelected = selectedTokenId === tokenId;
        return (
          <button
            key={tokenId.toString()}
            type="button"
            onClick={() => onSelect(tokenId)}
            className={`border-2 rounded-[var(--radius-sm)] px-4 py-3 text-sm font-mono font-bold transition-colors ${
              isSelected
                ? "border-accent bg-accent text-white"
                : "border-line bg-paper text-ink hover:border-accent"
            }`}
          >
            #{tokenId.toString()}
          </button>
        );
      })}
    </div>
  );
}
