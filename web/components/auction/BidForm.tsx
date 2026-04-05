"use client";

import { useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AUCTION_CONTRACT_ADDRESS, AUCTION_CONTRACT_ABI, type AuctionData } from "@/lib/auction-contract";

interface Props {
  auctionId: number;
  auction: AuctionData;
  onBidPlaced?: () => void;
}

export default function BidForm({ auctionId, auction, onBidPlaced }: Props) {
  const { address, isConnected } = useAccount();

  const hasBids = auction.highestBidder !== "0x0000000000000000000000000000000000000000";
  const minBid = hasBids
    ? formatEther((auction.highestBid * BigInt(105)) / BigInt(100)) // suggest +5%
    : formatEther(auction.startPrice);

  const [amount, setAmount] = useState(minBid);
  const [error, setError] = useState("");

  const ended = Date.now() / 1000 >= Number(auction.endTime);

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Notify parent when bid confirmed
  if (isSuccess && onBidPlaced) {
    onBidPlaced();
  }

  const handleBid = () => {
    setError("");
    let value: bigint;
    try {
      value = parseEther(amount);
    } catch {
      setError("Invalid amount");
      return;
    }

    const min = hasBids ? auction.highestBid + BigInt(1) : auction.startPrice;
    if (value < min) {
      setError(
        `Minimum bid is ${formatEther(min)} USDC`
      );
      return;
    }

    writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_CONTRACT_ABI,
      functionName: "bid",
      args: [BigInt(auctionId)],
      value,
    });
  };

  if (!isConnected) {
    return (
      <div className="card-brutalist p-5 flex flex-col items-center gap-4">
        <p className="text-sm text-muted text-center">
          Connect a wallet to place a bid.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (address?.toLowerCase() === auction.seller.toLowerCase()) {
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">You are the seller.</p>
      </div>
    );
  }

  if (ended && !auction.finalized) {
    return (
      <div className="card-brutalist p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink">Auction ended — ready to settle</p>
        <button
          onClick={() =>
            writeContract({
              address: AUCTION_CONTRACT_ADDRESS,
              abi: AUCTION_CONTRACT_ABI,
              functionName: "finalizeAuction",
              args: [BigInt(auctionId)],
            })
          }
          disabled={isPending || isConfirming}
          className="btn-brutalist btn-primary w-full"
        >
          {isPending || isConfirming ? "Settling…" : "Finalize Auction"}
        </button>
        {isSuccess && (
          <p className="text-sm font-semibold text-accent text-center">Auction finalized!</p>
        )}
      </div>
    );
  }

  if (ended || auction.finalized) {
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">This auction has ended.</p>
      </div>
    );
  }

  return (
    <div className="card-brutalist p-5 flex flex-col gap-3">
      <h3 className="text-base font-bold text-ink">Place a bid</h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">
          Amount (USDC)
        </label>
        <input
          type="number"
          step="any"
          min={minBid}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
          className="border-2 border-line rounded-[var(--radius-sm)] px-3 py-2 text-sm font-mono bg-paper text-ink focus:outline-none focus:border-accent"
          placeholder={`Min ${minBid}`}
        />
        {error && <p className="text-xs text-danger font-semibold">{error}</p>}
      </div>

      <button
        onClick={handleBid}
        disabled={isPending || isConfirming}
        className="btn-brutalist btn-primary w-full"
      >
        {isPending ? "Confirm in wallet…" : isConfirming ? "Confirming…" : "Place Bid"}
      </button>

      {isSuccess && (
        <p className="text-sm font-semibold text-accent text-center">Bid placed!</p>
      )}

      <p className="text-xs text-muted text-center">
        Your bid of {amount} USDC will be sent from your connected wallet.
      </p>
    </div>
  );
}
