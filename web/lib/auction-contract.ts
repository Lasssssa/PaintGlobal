/**
 * Smart contract address, ABI, and message-encoding helpers for PaintAuction.
 *
 * After deploying PaintAuction.sol, set NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS
 * in .env.local.
 *
 * Message encoding notes
 * ──────────────────────
 * The NFC bracelet signs raw bytes (hex-encoded, no 0x prefix) via libhalo.
 * The Solidity contract verifies the EIP-191 hash of those bytes, then
 * decodes them with abi.encodePacked-style tight packing.
 *
 * createAuction message  (148 bytes / 296 hex chars):
 *   tokenId[32] | payerWallet[20] | startPrice[32] | durationSeconds[32] | nonce[32]
 *
 * approveWithNfc message (52 bytes / 104 hex chars):
 *   tokenId[32] | spender[20]
 *
 * cancelAuction message  (32 bytes / 64 hex chars):
 *   auctionId[32]
 */

export const AUCTION_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const AUCTION_CONTRACT_ABI = [
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "AuctionCreated",
    inputs: [
      { name: "auctionId",   type: "uint256", indexed: true },
      { name: "seller",      type: "address", indexed: true },
      { name: "payerWallet", type: "address", indexed: true },
      { name: "tokenId",     type: "uint256", indexed: false },
      { name: "startPrice",  type: "uint256", indexed: false },
      { name: "endTime",     type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidPlaced",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "bidder",    type: "address", indexed: true },
      { name: "amount",    type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionFinalized",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "winner",    type: "address", indexed: true },
      { name: "amount",    type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionCancelled",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
    ],
  },
  // ── State-changing functions ───────────────────────────────────────────────
  {
    type: "function",
    name: "createAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nftContract",       type: "address" },
      { name: "tokenId",           type: "uint256" },
      { name: "payerWallet",       type: "address" },
      { name: "startPrice",        type: "uint256" },
      { name: "durationSeconds",   type: "uint256" },
      { name: "nonce",             type: "uint256" },
      { name: "v",                 type: "uint8" },
      { name: "r",                 type: "bytes32" },
      { name: "s",                 type: "bytes32" },
      { name: "hash",              type: "bytes32" },
      { name: "message",           type: "bytes" },
    ],
    outputs: [{ name: "auctionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "bid",
    stateMutability: "payable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "v",         type: "uint8" },
      { name: "r",         type: "bytes32" },
      { name: "s",         type: "bytes32" },
      { name: "hash",      type: "bytes32" },
      { name: "message",   type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // ── View functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "nftContract",   type: "address" },
          { name: "tokenId",       type: "uint256" },
          { name: "seller",        type: "address" },
          { name: "payerWallet",   type: "address" },
          { name: "startPrice",    type: "uint256" },
          { name: "endTime",       type: "uint256" },
          { name: "highestBidder", type: "address" },
          { name: "highestBid",    type: "uint256" },
          { name: "finalized",     type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "auctionCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "bracelet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingRefunds",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ── TypeScript type ────────────────────────────────────────────────────────

export type AuctionData = {
  nftContract:   `0x${string}`;
  tokenId:       bigint;
  seller:        `0x${string}`;
  payerWallet:   `0x${string}`;
  startPrice:    bigint;
  endTime:       bigint;
  highestBidder: `0x${string}`;
  highestBid:    bigint;
  finalized:     boolean;
};

// ── Message encoding helpers ───────────────────────────────────────────────

/**
 * Encode the bracelet message for PaintNFT.approveWithNfc.
 * Layout: tokenId[32] | spender[20]  (52 bytes tight-packed)
 * Returns a hex string WITHOUT 0x prefix, ready for signWithNfc().
 */
export function encodeApproveMessage(
  tokenId: bigint,
  spender: `0x${string}`
): string {
  // tokenId: 32 bytes big-endian
  const tokenIdHex = tokenId.toString(16).padStart(64, "0");
  // spender: 20 bytes (strip 0x)
  const spenderHex = spender.slice(2).toLowerCase().padStart(40, "0");
  return tokenIdHex + spenderHex; // 104 hex chars = 52 bytes
}

/**
 * Encode the bracelet message for PaintAuction.createAuction.
 * Layout: tokenId[32] | payerWallet[20] | startPrice[32] | durationSeconds[32] | nonce[32]
 * (148 bytes = 296 hex chars)
 * Returns a hex string WITHOUT 0x prefix, ready for signWithNfc().
 */
export function encodeAuctionMessage(
  tokenId: bigint,
  payerWallet: `0x${string}`,
  startPrice: bigint,
  durationSeconds: bigint,
  nonce: bigint
): string {
  const tokenIdHex         = tokenId.toString(16).padStart(64, "0");
  const payerWalletHex     = payerWallet.slice(2).toLowerCase().padStart(40, "0");
  const startPriceHex      = startPrice.toString(16).padStart(64, "0");
  const durationHex        = durationSeconds.toString(16).padStart(64, "0");
  const nonceHex           = nonce.toString(16).padStart(64, "0");
  return tokenIdHex + payerWalletHex + startPriceHex + durationHex + nonceHex;
}

/**
 * Encode the bracelet message for PaintAuction.cancelAuction.
 * Layout: auctionId[32]  (32 bytes = 64 hex chars)
 * Returns a hex string WITHOUT 0x prefix, ready for signWithNfc().
 */
export function encodeCancelMessage(auctionId: bigint): string {
  return auctionId.toString(16).padStart(64, "0");
}
