"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/web3";
import { useState } from "react";
import { NfcIdentityProvider } from "@/lib/nfc-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NfcIdentityProvider>
          {children}
        </NfcIdentityProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
