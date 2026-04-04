"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { CONTRACT_ADDRESS, CONTRACT_ABI, PAINTING_STATUS } from "@/lib/contract";
import { fetchMetadata, fetchImageUrl, type PaintingMetadata } from "@/lib/storage";

function paintingTuple(
  result: unknown
): { uri: string; author: `0x${string}`; status: number } | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    const [uri, author, status] = result as [string, `0x${string}`, number];
    return { uri, author, status: Number(status) };
  }
  const o = result as { uri: string; author: `0x${string}`; status: number };
  return { uri: o.uri, author: o.author, status: Number(o.status) };
}


interface PendingRow {
  id: number;
  uri: string;
  author: `0x${string}`;
  metadata: PaintingMetadata | null;
  imgSrc: string;
}

export default function AdminClient() {
  const { address, isConnected } = useAccount();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  const { data: ownerAddr } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "owner",
  });

  console.log(address, ownerAddr);
  const isOwner =
    !!address &&
    !!ownerAddr &&
    address.toLowerCase() === (ownerAddr as `${string}`).toLowerCase();

  const { data: countBn, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "paintingCount",
  });

  const n = countBn !== undefined ? Number(countBn) : 0;

  const paintingContracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "paintings" as const,
        args: [BigInt(i)] as const,
      })),
    [n]
  );

  const { data: paintingReads, refetch: refetchPaintings } = useReadContracts({
    contracts: paintingContracts,
    query: { enabled: isOwner && n >= 0 },
  });

  const loadPending = useCallback(async () => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    if (countBn === undefined) return;
    if (n > 0 && paintingReads === undefined) return;

    setLoading(true);
    try {
      const out: PendingRow[] = [];
      for (let i = 0; i < n; i++) {
        const row = paintingTuple(paintingReads?.[i]?.result);
        if (!row || row.status !== PAINTING_STATUS.Pending) continue;
        const metadata = await fetchMetadata(row.uri);
        const imgSrc = metadata ? fetchImageUrl(metadata.imageCID) : "";
        out.push({
          id: i,
          uri: row.uri,
          author: row.author,
          metadata,
          imgSrc,
        });
      }
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, [isOwner, countBn, n, paintingReads]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (writeError) {
      setNote(writeError.message.slice(0, 180));
      setTimeout(() => setNote(""), 5000);
    }
  }, [writeError]);

  useEffect(() => {
    if (isConfirmed) {
      setNote("Transaction confirmed.");
      refetchCount();
      refetchPaintings();
      setTimeout(() => setNote(""), 3000);
    }
  }, [isConfirmed, refetchCount, refetchPaintings]);

  const busy = isPending || isConfirming;

  if (!isConnected) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">Moderation</h1>
        <p className="mb-6 text-sm text-muted">Connect the contract owner wallet to approve or reject submissions.</p>
        <ConnectButton />
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="mb-4 text-3xl font-bold tracking-[-0.03em] text-ink">Moderation</h1>
        <div className="rounded-[var(--radius-sm)] border-2 border-line bg-ink/5 p-4 text-sm text-ink">
          This wallet is not the contract owner. If you are an organizer, connect with the owner account.
        </div>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-accent no-underline">
          ← Back to gallery
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">Moderation</h1>
      <p className="mb-8 text-sm text-muted">Approve or reject pending paintings. Only approved works appear in the gallery.</p>

      {note && (
        <div className="mb-4 rounded-[var(--radius-sm)] border-2 border-accent bg-accent-soft p-3 text-sm">{note}</div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((k) => (
            <div key={k} className="card-brutalist h-24 animate-pulse" style={{ boxShadow: "none" }} />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted">No pending submissions.</p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.id} className="card-brutalist flex flex-col gap-3 p-4 sm:flex-row sm:items-center" style={{ boxShadow: "none" }}>
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 border-line">
                {r.imgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imgSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted" style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}>
                    🖼️
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{r.metadata?.title ?? "Untitled"}</p>
                <p className="font-mono text-xs text-muted">
                  #{r.id} · {r.author.slice(0, 8)}…{r.author.slice(-6)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="btn-brutalist btn-primary"
                  onClick={() =>
                    writeContract({
                      address: CONTRACT_ADDRESS,
                      abi: CONTRACT_ABI,
                      functionName: "approve",
                      args: [BigInt(r.id)],
                    })
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-brutalist border-danger text-danger"
                  onClick={() =>
                    writeContract({
                      address: CONTRACT_ADDRESS,
                      abi: CONTRACT_ABI,
                      functionName: "reject",
                      args: [BigInt(r.id)],
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
