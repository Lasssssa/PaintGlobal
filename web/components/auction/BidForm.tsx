"use client";

import { useState, useEffect, useContext } from "react";
import { parseEther, formatEther } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  AUCTION_CONTRACT_ADDRESS,
  AUCTION_CONTRACT_ABI,
  ZERO_ADDRESS,
  encodeRegisterBidPayerMessage,
  type AuctionData,
} from "@/lib/auction-contract";
import { NfcIdentityContext } from "@/lib/nfc-context";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";

function addrEq(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

interface Props {
  auctionId: number;
  auction: AuctionData;
  onBidPlaced?: () => void;
}

export default function BidForm({ auctionId, auction, onBidPlaced }: Props) {
  const { address, isConnected } = useAccount();
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);

  const hasBids = auction.highestPayer !== ZERO_ADDRESS;
  const minBid = hasBids
    ? formatEther((auction.highestBid * BigInt(105)) / BigInt(100))
    : formatEther(auction.startPrice);

  const [amount, setAmount] = useState(minBid);
  const [error, setError] = useState("");
  const [linkNote, setLinkNote] = useState("");

  const ended = Date.now() / 1000 >= Number(auction.endTime);

  const { data: linkedNfc, refetch: refetchBidLink } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "bidPayerToNfc",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: bidLinkNonce } = useReadContract({
    address: AUCTION_CONTRACT_ADDRESS,
    abi: AUCTION_CONTRACT_ABI,
    functionName: "bidLinkNonces",
    args: nfcAddress ? [nfcAddress as `0x${string}`] : undefined,
    query: { enabled: !!nfcAddress },
  });

  const isLinked =
    !!linkedNfc &&
    (linkedNfc as string).toLowerCase() !== ZERO_ADDRESS.toLowerCase();

  const {
    writeContract: writeRegister,
    data: registerTxHash,
    isPending: registerPending,
    reset: resetRegister,
  } = useWriteContract();

  const { isLoading: registerConfirming, isSuccess: registerSuccess } =
    useWaitForTransactionReceipt({
      hash: registerTxHash,
    });

  const {
    writeContract: writeBid,
    data: bidTxHash,
    isPending: bidPending,
    reset: resetBid,
  } = useWriteContract();

  const { isLoading: bidConfirming, isSuccess: bidSuccess } =
    useWaitForTransactionReceipt({
      hash: bidTxHash,
    });

  const {
    writeContract: writeFinalize,
    data: finalizeTxHash,
    isPending: finalizePending,
  } = useWriteContract();

  const { isLoading: finalizeConfirming, isSuccess: finalizeSuccess } =
    useWaitForTransactionReceipt({
      hash: finalizeTxHash,
    });

  useEffect(() => {
    if (bidSuccess && onBidPlaced) onBidPlaced();
  }, [bidSuccess, onBidPlaced]);

  useEffect(() => {
    if (finalizeSuccess && onBidPlaced) onBidPlaced();
  }, [finalizeSuccess, onBidPlaced]);

  useEffect(() => {
    if (registerSuccess) refetchBidLink();
  }, [registerSuccess, refetchBidLink]);

  const handleIdentityTap = async () => {
    setLinkNote("Tap your bracelet…");
    try {
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setLinkNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setLinkNote("Keep holding…");
        if (evt.cause === "retry") setLinkNote("Try again…");
        if (evt.cause === "scanned") setLinkNote("Scanned!");
      });
      setNfcAddress(sig.signerAddress);
      setLinkNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = "NFC scan failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported on this device";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      setLinkNote(msg);
    }
  };

  const handleLinkWallet = async () => {
    if (!address || !nfcAddress || bidLinkNonce === undefined) return;
    setError("");
    setLinkNote("Tap your bracelet to authorize this wallet…");
    const hexMessage = encodeRegisterBidPayerMessage(
      address as `0x${string}`,
      bidLinkNonce as bigint
    );
    try {
      const sig = await signWithNfc(hexMessage, (evt: NfcStatusEvent) => {
        if (evt.cause === "init") setLinkNote(evt.method === "credential" ? "Hold your iPhone near the bracelet…" : "Tap your bracelet…");
        if (evt.cause === "again") setLinkNote("Keep holding…");
        if (evt.cause === "retry") setLinkNote("Try again…");
        if (evt.cause === "scanned") setLinkNote("Signed! Confirm in wallet…");
      });
      resetRegister();
      writeRegister({
        address: AUCTION_CONTRACT_ADDRESS,
        abi: AUCTION_CONTRACT_ABI,
        functionName: "registerBidPayer",
        args: [
          sig.v,
          sig.r as `0x${string}`,
          sig.s as `0x${string}`,
          sig.hash as `0x${string}`,
          `0x${hexMessage}` as `0x${string}`,
        ],
      });
      setLinkNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      let msg = err instanceof Error ? err.message : "Link failed";
      if (name === "NFCMethodNotSupported") msg = "NFC not supported";
      else if (name === "NFCPermissionRequestDenied") msg = "NFC permission denied";
      setError(msg);
      setLinkNote("");
    }
  };

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
      setError(`Minimum bid is ${formatEther(min)} USDC`);
      return;
    }

    resetBid();
    writeBid({
      address: AUCTION_CONTRACT_ADDRESS,
      abi: AUCTION_CONTRACT_ABI,
      functionName: "bid",
      args: [BigInt(auctionId)],
      value,
    });
  };

  const isSeller = addrEq(address, auction.seller);
  const isProceedsWallet = addrEq(address, auction.payerWallet);
  const isWinningPayer = hasBids && addrEq(address, auction.highestPayer);

  /** UI seulement : le contrat reste appelable par tous. */
  const canFinalize = isSeller || isWinningPayer;

  /* WalletConnect peut exposer l'adresse pendant `status === 'connecting'` avec `isConnected` encore false. */
  if (!isConnected) {
    if (!address) {
      if (ended && !auction.finalized) {
        return (
          <div className="card-brutalist p-5 flex flex-col items-center gap-4">
            <p className="text-sm text-muted text-center">
              This auction has ended. Connect with the seller or winning wallet to finalize settlement.
            </p>
            <ConnectButton />
          </div>
        );
      }
      return (
        <div className="card-brutalist p-5 flex flex-col items-center gap-4">
          <p className="text-sm text-muted text-center">Connect a wallet to place a bid.</p>
          <ConnectButton />
        </div>
      );
    }
    return (
      <div className="card-brutalist p-5 flex flex-col items-center gap-4">
        <p className="text-sm text-muted text-center">Finishing wallet connection…</p>
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"
          aria-hidden
        />
      </div>
    );
  }

  if (auction.finalized) {
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">This auction has ended.</p>
      </div>
    );
  }

  if (ended) {
    if (canFinalize) {
      return (
        <div className="card-brutalist p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">Auction ended — ready to settle</p>
          <button
            type="button"
            onClick={() =>
              writeFinalize({
                address: AUCTION_CONTRACT_ADDRESS,
                abi: AUCTION_CONTRACT_ABI,
                functionName: "finalizeAuction",
                args: [BigInt(auctionId)],
              })
            }
            disabled={finalizePending || finalizeConfirming}
            className="btn-brutalist btn-primary w-full"
          >
            {finalizePending || finalizeConfirming ? "Settling…" : "Finalize auction"}
          </button>
          {finalizeSuccess && (
            <p className="text-sm font-semibold text-accent text-center">Auction finalized!</p>
          )}
        </div>
      );
    }
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">
          This auction has ended. Only the seller or the winning bidder can finalize settlement.
        </p>
      </div>
    );
  }

  if (!isLinked) {
    const hasNfc = typeof window !== "undefined" && isNfcAvailable();
    const regBusy = registerPending || registerConfirming;
    return (
      <div className="card-brutalist p-5 flex flex-col gap-3">
        <h3 className="text-base font-bold text-ink">Link wallet to bracelet</h3>
        <p className="text-xs text-muted">
          You pay from this wallet; won NFTs go to your NFC bracelet. One-time link per wallet.
        </p>
        {!hasNfc && (
          <p className="text-xs text-danger font-semibold">NFC is not available on this device.</p>
        )}
        {!nfcAddress && hasNfc && (
          <>
            <p className="text-sm text-muted">First, identify your bracelet.</p>
            <button
              type="button"
              onClick={handleIdentityTap}
              className="btn-brutalist btn-primary w-full"
            >
              Tap bracelet to identify
            </button>
          </>
        )}
        {nfcAddress && bidLinkNonce !== undefined && (
          <button
            type="button"
            onClick={handleLinkWallet}
            disabled={regBusy}
            className="btn-brutalist btn-primary w-full"
          >
            {registerPending ? "Confirm in wallet…" : registerConfirming ? "Confirming…" : "Sign link & register on-chain"}
          </button>
        )}
        {nfcAddress && bidLinkNonce === undefined && (
          <p className="text-xs text-muted">Loading nonce…</p>
        )}
        {linkNote && <p className="text-sm text-accent text-center animate-pulse">{linkNote}</p>}
        {error && <p className="text-xs text-danger font-semibold">{error}</p>}
        {registerSuccess && (
          <p className="text-sm font-semibold text-accent text-center">Wallet linked. You can bid below.</p>
        )}
      </div>
    );
  }

  if (isSeller) {
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">You are the seller — you cannot bid on your own auction.</p>
      </div>
    );
  }

  if (isProceedsWallet) {
    return (
      <div className="card-brutalist p-4">
        <p className="text-sm text-muted text-center">
          This wallet receives auction proceeds — you cannot bid on your own listing.
        </p>
      </div>
    );
  }

  const bidBusy = bidPending || bidConfirming;

  return (
    <div className="card-brutalist p-5 flex flex-col gap-3">
      <h3 className="text-base font-bold text-ink">Place a bid</h3>
      <p className="text-xs text-muted">
        Payment from your wallet · NFT goes to bracelet{" "}
        <span className="font-mono text-ink">
          {(linkedNfc as string).slice(0, 6)}…{(linkedNfc as string).slice(-4)}
        </span>
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">Amount (USDC)</label>
        <input
          type="number"
          step="any"
          min={minBid}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
          className="input-brutalist font-mono"
          placeholder={`Min ${minBid}`}
        />
        {error && <p className="text-xs text-danger font-semibold">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleBid}
        disabled={bidBusy}
        className="btn-brutalist btn-primary w-full"
      >
        {bidPending ? "Confirm in wallet…" : bidConfirming ? "Confirming…" : "Place bid"}
      </button>

      {bidSuccess && (
        <p className="text-sm font-semibold text-accent text-center">Bid placed!</p>
      )}

      <p className="text-xs text-muted text-center">
        Your bid of {amount} USDC will be sent from your connected wallet.
      </p>
    </div>
  );
}
