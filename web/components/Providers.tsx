"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { WagmiProvider, useReconnect, useAccount } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/web3";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NfcIdentityProvider } from "@/lib/nfc-context";

/** Après WalletConnect / retour d’app mobile, resynchronise la session sans refresh. */
function WalletReconnectOnResume() {
  const { reconnect } = useReconnect();

  useEffect(() => {
    const sync = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      reconnect();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [reconnect]);

  return null;
}

/**
 * WalletConnect / wagmi peuvent mettre à jour le store sans que certaines vues se réalignent
 * (lectures TanStack en cache, RSC figés). On invalide les lectures contrat et on soft-refresh Next.
 */
function WagmiUiSync() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { address, chainId, status } = useAccount();
  const skipFirst = useRef(true);
  const prevAddrChain = useRef("");

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      prevAddrChain.current = `${address ?? ""}|${chainId ?? ""}`;
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["readContract"] }),
      queryClient.invalidateQueries({ queryKey: ["readContracts"] }),
      queryClient.invalidateQueries({ queryKey: ["simulateContract"] }),
    ]);

    const ac = `${address ?? ""}|${chainId ?? ""}`;
    if (prevAddrChain.current !== ac) {
      prevAddrChain.current = ac;
      router.refresh();
    }
  }, [address, chainId, status, queryClient, router]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletReconnectOnResume />
          <WagmiUiSync />
          <NfcIdentityProvider>
            {children}
          </NfcIdentityProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
