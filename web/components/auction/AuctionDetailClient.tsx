"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useReadContract, usePublicClient } from "wagmi";
import {
  AUCTION_CONTRACT_ADDRESS,
  AUCTION_CONTRACT_ABI,
  type AuctionData,
} from "@/lib/auction-contract";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";
import CountdownTimer from "./CountdownTimer";
import BidForm from "./BidForm";

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud";

function ipfsToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://${GATEWAY}/ipfs/${uri.slice(7)}`;
  return uri;
}

interface NftMeta {
  name: string;
  image: string;
  description?: string;
}

interface BidEvent {
  bidder: string;
  amount: bigint;
  blockNumber: bigint;
}

interface Props {
  auctionId: number;
}

export default function AuctionDetailClient({ auctionId }: Props) {
  const publicClient = usePublicClient();

  const { data: auctionRaw, refetch } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "getAuction",
    args: [BigInt(auctionId)],
    query: { refetchInterval: 10_000 },
  });

  const auction = auctionRaw as AuctionData | undefined;

  const { data: tokenUri } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_CONTRACT_ABI,
    functionName: "tokenURI",
    args: auction ? [auction.tokenId] : undefined,
    query: { enabled: !!auction },
  });

  const [meta, setMeta] = useState<NftMeta | null>(null);
  const [bids, setBids] = useState<BidEvent[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Fetch NFT metadata from IPFS
  useEffect(() => {
    if (!tokenUri) return;
    let cancelled = false;
    setLoadingMeta(true);
    fetch(ipfsToHttp(tokenUri as string))
      .then((r) => r.json())
      .then((data: NftMeta) => {
        if (!cancelled) setMeta(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => { cancelled = true; };
  }, [tokenUri]);

  // Fetch bid history from on-chain logs
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    async function loadBids() {
      try {
        const logs = await publicClient!.getLogs({
          address: AUCTION_CONTRACT_ADDRESS,
          event: {
            type: "event",
            name: "BidPlaced",
            inputs: [
              { name: "auctionId", type: "uint256", indexed: true },
              { name: "bidder",    type: "address", indexed: true },
              { name: "amount",    type: "uint256", indexed: false },
            ],
          },
          args: { auctionId: BigInt(auctionId) },
          fromBlock: BigInt(0),
        });
        if (cancelled) return;
        const parsed: BidEvent[] = logs
          .map((log) => ({
            bidder: (log.args as { bidder?: string }).bidder ?? "",
            amount: (log.args as { amount?: bigint }).amount ?? BigInt(0),
            blockNumber: log.blockNumber ?? BigInt(0),
          }))
          .reverse(); // newest first
        setBids(parsed);
      } catch {
        // ignore
      }
    }
    loadBids();
    return () => { cancelled = true; };
  }, [publicClient, auctionId]);

  if (!auction) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="skeleton rounded-[var(--radius-base)]" style={{ aspectRatio: "1" }} />
          <div className="flex flex-col gap-4">
            {[180, 120, 80].map((h, i) => (
              <div key={i} className="skeleton rounded-[var(--radius-sm)]" style={{ height: h }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const hasBids = auction.highestBidder !== "0x0000000000000000000000000000000000000000";

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: NFT image */}
        <div className="card-brutalist overflow-hidden">
          {meta?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ipfsToHttp(meta.image)}
              alt={meta.name}
              className="w-full object-cover"
            />
          ) : loadingMeta ? (
            <div
              className="skeleton"
              style={{ aspectRatio: "1" }}
            />
          ) : (
            <div
              className="flex items-center justify-center text-6xl"
              style={{ aspectRatio: "1", background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
            >
              🖼️
            </div>
          )}
        </div>

        {/* Right: info + bid form */}
        <div className="flex flex-col gap-5">
          {/* Title & NFT ID */}
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">
              {meta?.name ?? `NFT #${auction.tokenId.toString()}`}
            </h1>
            {meta?.description && (
              <p className="mt-1 text-sm text-muted">{meta.description}</p>
            )}
            <p className="mt-2 font-mono text-xs text-muted">
              Token ID {auction.tokenId.toString()} · {NFT_CONTRACT_ADDRESS.slice(0,6)}…{NFT_CONTRACT_ADDRESS.slice(-4)}
            </p>
          </div>

          {/* Auction info card */}
          <div className="card-brutalist p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Time remaining</span>
              <CountdownTimer endTime={auction.endTime} />
            </div>

            <div className="border-t border-line/50 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">
                {hasBids ? "Current bid" : "Starting price"}
              </span>
              <span className="text-xl font-bold text-ink">
                {formatEther(hasBids ? auction.highestBid : auction.startPrice)} USDC
              </span>
            </div>

            {hasBids && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">Highest bidder</span>
                <span className="font-mono text-sm text-ink">
                  {auction.highestBidder.slice(0,6)}…{auction.highestBidder.slice(-4)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Seller</span>
              <span className="font-mono text-sm text-ink">
                {auction.seller.slice(0,6)}…{auction.seller.slice(-4)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Proceeds to</span>
              <span className="font-mono text-sm text-ink">
                {auction.payerWallet.slice(0,6)}…{auction.payerWallet.slice(-4)}
              </span>
            </div>
          </div>

          {/* Bid form */}
          <BidForm
            auctionId={auctionId}
            auction={auction}
            onBidPlaced={() => refetch()}
          />

          {/* Bid history */}
          {bids.length > 0 && (
            <div className="card-brutalist p-5 flex flex-col gap-2">
              <h3 className="text-sm font-bold text-ink">Bid history</h3>
              <div className="flex flex-col gap-1">
                {bids.map((bid, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted">
                      {bid.bidder.slice(0,6)}…{bid.bidder.slice(-4)}
                    </span>
                    <span className="font-semibold text-ink">
                      {formatEther(bid.amount)} USDC
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
