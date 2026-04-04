"use client";

import { useContext, useState, useEffect, type ReactNode } from "react";
import { NfcIdentityContext } from "@/lib/nfc-context";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";

export default function NfcGuard({ children }: { children: ReactNode }) {
  const { nfcAddress, setNfcAddress } = useContext(NfcIdentityContext);
  const [hasNfc, setHasNfc] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setHasNfc(isNfcAvailable());
  }, []);

  // Identité déjà connue → accès libre
  if (nfcAddress) return <>{children}</>;

  // Vérification en cours côté client (SSR safe)
  if (hasNfc === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="h-16 w-16 animate-pulse rounded-2xl bg-ink/10" />
        <div className="h-4 w-48 animate-pulse rounded bg-ink/5" />
      </main>
    );
  }

  // NFC indisponible sur cet appareil
  if (!hasNfc) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <span className="text-6xl">📲</span>
        <div>
          <h1 className="text-2xl font-bold text-ink">NFC Required</h1>
          <p className="mt-2 text-sm text-muted">
            PaintGlobal requires an NFC HaLo bracelet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Open this page on a compatible mobile device.
          </p>
        </div>
      </main>
    );
  }

  const handleTap = async () => {
    try {
      setScanning(true);
      setNote("Tap your bracelet…");
      const sig = await signWithNfc("000000", (evt: NfcStatusEvent) => {
        if (evt.cause === "init") {
          setNote(
            evt.method === "credential"
              ? "Hold your iPhone near the bracelet…"
              : "Tap your bracelet…"
          );
        }
        if (evt.cause === "again") setNote("Keep holding…");
        if (evt.cause === "retry") setNote("Try again…");
        if (evt.cause === "scanned") setNote("Scanned!");
      });
      setNfcAddress(sig.signerAddress);
      setNote("");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NFCMethodNotSupported") setNote("NFC not supported on this device.");
      else if (name === "NFCPermissionRequestDenied") setNote("NFC permission denied.");
      else setNote("NFC scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const isError =
    note.includes("failed") ||
    note.includes("denied") ||
    note.includes("not supported");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Gemini_Generated_Image_7gj2y07gj2y07gj2.jpeg"
        alt="PaintGlobal"
        style={{ height: "80px", width: "80px", objectFit: "contain", borderRadius: "14px" }}
      />
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink">
          Welcome to PaintGlobal
        </h1>
        <p className="mt-2 text-sm text-muted">
          Tap your NFC bracelet to identify yourself and start.
        </p>
      </div>

      <button
        onClick={handleTap}
        disabled={scanning}
        className="btn-brutalist btn-primary px-10 py-3 text-base"
      >
        {scanning ? "Scanning…" : "Tap bracelet"}
      </button>

      {note && (
        <p
          className={`text-sm font-semibold ${
            isError ? "text-danger" : "text-accent animate-pulse"
          }`}
        >
          {note}
        </p>
      )}
    </main>
  );
}
