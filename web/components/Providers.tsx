"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useReconnect } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/web3";
import { useState, useEffect } from "react";
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

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletReconnectOnResume />
          <NfcIdentityProvider>
            {children}
          </NfcIdentityProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
