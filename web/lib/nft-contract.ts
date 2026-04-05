/**
 * Smart contract address & ABI for PaintNFT (ERC-721).
 *
 * After deploying PaintNFT.sol, set NEXT_PUBLIC_NFT_CONTRACT_ADDRESS in .env.local.
 */

export const NFT_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const NFT_CONTRACT_ABI = [
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "uri", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paintingId", type: "uint256" },
      { name: "uri", type: "string" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "hash", type: "bytes32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "paintingMinted",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "approveWithNfc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "spender", type: "address" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "hash", type: "bytes32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
