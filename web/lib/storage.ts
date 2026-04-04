/**
 * IPFS storage integration via Pinata.
 *
 * Images and metadata JSON are pinned to IPFS through a server-side API route
 * (/api/upload) that holds the Pinata JWT. Downloads go through the public
 * Pinata gateway.
 */

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "gateway.pinata.cloud";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaintingMetadata {
  title: string;
  /** IPFS CID of the image file */
  imageCID: string;
  /** Mime type of the original image (e.g. "image/jpeg") */
  imageMime: string;
  author: string;
  timestamp: number;
}

// ── Upload helpers ────────────────────────────────────────────────────────────

async function pinFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: form });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }

  const { cid } = (await res.json()) as { cid: string };
  return cid;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a painting image to IPFS.
 * @returns The IPFS CID of the uploaded image.
 */
export async function uploadImage(file: File): Promise<string> {
  return pinFile(file);
}

/**
 * Upload painting metadata JSON to IPFS.
 * @returns The IPFS CID to store on-chain.
 */
export async function uploadMetadata(meta: PaintingMetadata): Promise<string> {
  const json = JSON.stringify(meta);
  const file = new File([json], "metadata.json", {
    type: "application/json",
  });
  return pinFile(file);
}

/**
 * Fetch painting metadata from its IPFS CID.
 */
export async function fetchMetadata(
  uri: string
): Promise<PaintingMetadata | null> {
  const cid = uri.startsWith("ipfs://") ? uri.slice(7) : uri;
  try {
    const res = await fetch(`https://${GATEWAY}/ipfs/${cid}`);
    if (!res.ok) return null;
    return (await res.json()) as PaintingMetadata;
  } catch (err) {
    console.error("fetchMetadata error:", err);
    return null;
  }
}

/**
 * Return a public gateway URL for an image stored on IPFS.
 */
export function fetchImageUrl(imageCID: string): string {
  const cid = imageCID.startsWith("ipfs://") ? imageCID.slice(7) : imageCID;
  return `https://${GATEWAY}/ipfs/${cid}`;
}
