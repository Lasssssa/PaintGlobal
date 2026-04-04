import { NextRequest, NextResponse } from "next/server";
import { getPublicClient, getWalletClient } from "@/lib/relayer";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paintingId, support, v, r, s, hash, message } = body as {
      paintingId: number;
      support: boolean;
      v: number;
      r: string;
      s: string;
      hash: string;
      message: string;
    };

    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "voteWithNfc",
      args: [
        BigInt(paintingId),
        support,
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
    console.error("NFC vote relay error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
