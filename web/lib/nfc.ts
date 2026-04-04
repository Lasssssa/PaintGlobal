/**
 * HaLo NFC bracelet integration via @arx-research/libhalo.
 *
 * The bracelet signs messages with its hardware ECDSA secp256k1 key.
 * Two NFC methods depending on platform:
 *   - "webnfc"     (Chrome Android) — Web NFC API (NDEFReader)
 *   - "credential"  (Safari iOS)    — Credential API, OS shows native NFC prompt
 *
 * execHaloCmdWeb auto-detects the right method at runtime.
 */

export interface NfcSignature {
  v: number;
  r: string;
  s: string;
  hash: string;
  signerAddress: string;
}

export type NfcMethod = "webnfc" | "credential";

export interface NfcStatusEvent {
  cause: "init" | "again" | "retry" | "scanned";
  /** "credential" on iOS, "webnfc" on Android */
  method?: NfcMethod;
  /** Call to abort the scan from the UI */
  cancelScan?: () => void;
}

/**
 * Sync heuristic: can this device likely interact with HaLo NFC tags?
 *
 * - Android → NDEFReader present (webnfc)
 * - iPhone  → credential method via Safari (no NDEFReader)
 *
 * This is intentionally optimistic; the real capability is confirmed
 * when execHaloCmdWeb runs (throws NFCMethodNotSupported if unavailable).
 */
export function isNfcAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if ("NDEFReader" in window) return true;
  if (/iPhone|iPod/i.test(navigator.userAgent)) return true;
  return false;
}

/**
 * Async check: query libhalo for the NFC method this platform supports.
 * Returns the method name or null if NFC is unsupported.
 */
export async function detectNfcMethod(): Promise<NfcMethod | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@arx-research/libhalo/api/web");
    if (typeof mod.haloGetDefaultMethod === "function") {
      return mod.haloGetDefaultMethod() as NfcMethod;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encode a painting ID as a 4-char hex string (2 bytes big-endian).
 */
export function encodePaintingId(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/**
 * Encode a vote message as a 6-char hex string (3 bytes):
 *   bytes 0-1: painting ID (big-endian uint16)
 *   byte 2:    0x01 = support, 0x00 = pass
 */
export function encodeVoteMessage(id: number, support: boolean): string {
  return id.toString(16).padStart(4, "0") + (support ? "01" : "00");
}

/**
 * Ask the user to tap their HaLo bracelet and sign a hex message.
 * @param message Hex string without 0x prefix
 * @param onStatus Callback for UX feedback with platform-aware info
 */
export async function signWithNfc(
  message: string,
  onStatus?: (event: NfcStatusEvent) => void
): Promise<NfcSignature> {
  const { execHaloCmdWeb } = await import("@arx-research/libhalo/api/web");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (execHaloCmdWeb as any)(
    {
      name: "sign",
      keyNo: 1,
      message,
    },
    {
      statusCallback: (
        cause: string,
        statusObj?: { execMethod?: string; cancelScan?: () => void }
      ) => {
        onStatus?.({
          cause: cause as NfcStatusEvent["cause"],
          method: statusObj?.execMethod as NfcMethod | undefined,
          cancelScan: statusObj?.cancelScan,
        });
      },
    }
  );

  return {
    v: result.signature.raw.v,
    r: `0x${result.signature.raw.r}`,
    s: `0x${result.signature.raw.s}`,
    hash: `0x${result.input.digest}`,
    signerAddress: result.etherAddress,
  };
}
