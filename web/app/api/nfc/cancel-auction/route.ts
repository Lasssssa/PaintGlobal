import { NextRequest, NextResponse } from "next/server";
import { getPublicClient, getWalletClient } from "@/lib/relayer";
import { AUCTION_CONTRACT_ADDRESS, AUCTION_CONTRACT_ABI } from "@/lib/auction-contract";

/**
 * POST /api/nfc/cancel-auction
 *
 * Relay endpoint: calls PaintAuction.cancelAuction on behalf of the bracelet.
 * Only succeeds if no bids have been placed and the bracelet signature is valid.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auctionId, v, r, s, hash, message } = body as {
      auctionId: string;
      v: number;
      r: string;
      s: string;
      hash: string;
      message: string;
    };

    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    const txHash = await walletClient.writeContract({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_CONTRACT_ABI,
      functionName: "cancelAuction",
      args: [
        BigInt(auctionId),
        v,
        r as `0x${string}`,
        s as `0x${string}`,
        hash as `0x${string}`,
        message as `0x${string}`,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({ txHash });
  } catch (err) {
    console.error("NFC cancel-auction relay error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
