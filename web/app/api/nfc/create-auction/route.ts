import { NextRequest, NextResponse } from "next/server";
import { getPublicClient, getWalletClient } from "@/lib/relayer";
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "@/lib/nft-contract";
import { AUCTION_CONTRACT_ADDRESS, AUCTION_CONTRACT_ABI } from "@/lib/auction-contract";

/**
 * POST /api/nfc/create-auction
 *
 * Relay endpoint that handles the two-step auction creation flow:
 *   1. Call PaintNFT.approveWithNfc  — authorises auction contract to take the NFT
 *   2. Call PaintAuction.createAuction — creates the auction and transfers the NFT
 *
 * The frontend must have collected TWO separate bracelet signatures:
 *   - approveV/R/S/Hash/Message  → signs encodeApproveMessage(tokenId, AUCTION_CONTRACT_ADDRESS)
 *   - auctionV/R/S/Hash/Message  → signs encodeAuctionMessage(tokenId, payerWallet, ...)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tokenId,
      payerWallet,
      startPrice,
      durationSeconds,
      nonce,
      // Approve signature
      approveV,
      approveR,
      approveS,
      approveHash,
      approveMessage,
      // Auction creation signature
      auctionV,
      auctionR,
      auctionS,
      auctionHash,
      auctionMessage,
    } = body as {
      tokenId: string;
      payerWallet: string;
      startPrice: string;
      durationSeconds: string;
      nonce: string;
      approveV: number;
      approveR: string;
      approveS: string;
      approveHash: string;
      approveMessage: string;
      auctionV: number;
      auctionR: string;
      auctionS: string;
      auctionHash: string;
      auctionMessage: string;
    };

    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    // ── Step 1: approveWithNfc ─────────────────────────────────────────────
    const approveTxHash = await walletClient.writeContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_CONTRACT_ABI,
      functionName: "approveWithNfc",
      args: [
        BigInt(tokenId),
        AUCTION_CONTRACT_ADDRESS,
        approveV,
        approveR as `0x${string}`,
        approveS as `0x${string}`,
        approveHash as `0x${string}`,
        approveMessage as `0x${string}`,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // ── Step 2: createAuction ──────────────────────────────────────────────
    const createTxHash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_CONTRACT_ABI,
      functionName: "createAuction",
      args: [
        NFT_CONTRACT_ADDRESS,
        BigInt(tokenId),
        payerWallet as `0x${string}`,
        BigInt(startPrice),
        BigInt(durationSeconds),
        BigInt(nonce),
        auctionV,
        auctionR as `0x${string}`,
        auctionS as `0x${string}`,
        auctionHash as `0x${string}`,
        auctionMessage as `0x${string}`,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: createTxHash,
    });

    // Parse auctionId from AuctionCreated event logs
    const auctionCreatedTopic =
      "0x" +
      Buffer.from(
        "AuctionCreated(uint256,address,address,uint256,uint256,uint256)"
      )
        .toString("hex")
        .replace(/^/, "");

    // The auctionId is the first indexed topic (topic[1])
    let auctionId: string | null = null;
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === AUCTION_CONTRACT_ADDRESS.toLowerCase() &&
        log.topics[0]
      ) {
        // topics[1] is auctionId (indexed uint256, padded to 32 bytes)
        if (log.topics[1]) {
          auctionId = BigInt(log.topics[1]).toString();
        }
        break;
      }
    }

    return NextResponse.json({ txHash: createTxHash, auctionId });
  } catch (err) {
    console.error("NFC create-auction relay error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
