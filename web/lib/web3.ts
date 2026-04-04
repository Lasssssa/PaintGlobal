/**
 * Wagmi + RainbowKit configuration — ARC Testnet
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
export { arcTestnet } from "./chain";
import { arcTestnet } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "PaintGlobal",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo_project_id",
  chains: [arcTestnet],
  ssr: true,
});
