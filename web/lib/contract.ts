/**
 * Smart contract address & ABI for PaintVote.
 *
 * After deploying PaintVote.sol, set NEXT_PUBLIC_CONTRACT_ADDRESS to the deployed address.
 */
// ── Address ──────────────────────────────────────────────────────────────────
export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

/** Enum values match contract `PaintVote.Status` */
export const PAINTING_STATUS = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
} as const;

export type PaintingStatus = (typeof PAINTING_STATUS)[keyof typeof PAINTING_STATUS];

// ── ABI ─────────────────────────────────────────────────────────────────────
export const CONTRACT_ABI = [
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
    name: "PaintingApproved",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "author", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PaintingRejected",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "author", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Voted",
    inputs: [
      { name: "paintingId", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "support", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
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
    inputs: [
      { name: "paintingId", type: "uint256" },
      { name: "support", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "paintings",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "uri", type: "string" },
      { name: "author", type: "address" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "getPainting",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "uri", type: "string" },
      { name: "author", type: "address" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "paintingCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
    name: "negativeVotes",
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
    name: "hasVotedNegative",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hasApprovedSubmission",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hasPendingSubmission",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "voteWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paintingId", type: "uint256" },
      { name: "support", type: "bool" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "hash", type: "bytes32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Tipped",
    inputs: [
      { name: "paintingId", type: "uint256", indexed: true },
      { name: "tipper", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "tips",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasTipped",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "tipWithNfc",
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
    name: "batchVoteWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paintingIds", type: "uint256[]" },
      { name: "voteDirections", type: "bool[]" },
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
