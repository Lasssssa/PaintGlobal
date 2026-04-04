"use client";

import { createContext, useState, ReactNode } from "react";

interface NfcIdentityContextValue {
  nfcAddress: string | null;
  setNfcAddress: (addr: string) => void;
}

export const NfcIdentityContext = createContext<NfcIdentityContextValue>({
  nfcAddress: null,
  setNfcAddress: () => {},
});

export function NfcIdentityProvider({ children }: { children: ReactNode }) {
  const [nfcAddress, setNfcAddress] = useState<string | null>(null);

  return (
    <NfcIdentityContext.Provider value={{ nfcAddress, setNfcAddress }}>
      {children}
    </NfcIdentityContext.Provider>
  );
}
