/**
 * Viem clients for the NFC relayer (server-side only).
 *
 * The relayer holds a private key and submits transactions on behalf
 * of NFC bracelet users, paying gas so they don't need a wallet.
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./chain";

const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined;

function getAccount() {
  if (!relayerKey) throw new Error("RELAYER_PRIVATE_KEY not set");
  return privateKeyToAccount(relayerKey);
}

export function getPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });
}

export function getWalletClient() {
  return createWalletClient({
    account: getAccount(),
    chain: arcTestnet,
    transport: http(),
  });
}
