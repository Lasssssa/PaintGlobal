/**
 * Smart contract address & ABI for PaintVote.
 *
 * After deploying PaintVote.sol, replace CONTRACT_ADDRESS with the real address.
 * The ABI below matches the deployed contract exactly.
 */

// ── Address ──────────────────────────────────────────────────────────────────
// Replace with your deployed contract address on ARC Testnet (or any EVM chain)
export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

// ── ABI ──────────────────────────────────────────────────────────────────────
export const CONTRACT_ABI = [
  // Events
  {
    type: "event",
    name: "PaintingAdded",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "uri", type: "string", indexed: false },
      { name: "author", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Voted",
    inputs: [
      { name: "paintingId", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
    ],
  },
  // Write
  {
    type: "function",
    name: "addPainting",
    stateMutability: "nonpayable",
    inputs: [{ name: "uri", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [{ name: "paintingId", type: "uint256" }],
    outputs: [],
  },
  // Read
  {
    type: "function",
    name: "getPaintings",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    type: "function",
    name: "paintingURIs",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "votes",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasVoted",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "paintingCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // NFC Write (gasless via relayer)
  {
    type: "function",
    name: "voteWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paintingId", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "hash", type: "bytes32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addPaintingWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uri", type: "string" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "hash", type: "bytes32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
