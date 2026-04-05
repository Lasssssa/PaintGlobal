"use client";

import { useState, useRef, ChangeEvent, useEffect, useContext } from "react";
import { useRouter } from "next/navigation";
import { uploadImage, uploadMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";
import { NfcIdentityContext } from "@/lib/nfc-context";

type Step =
  | "idle"
  | "uploading-image"
  | "uploading-meta"
  | "nfc-signing"
  | "nfc-submitting"
  | "done"
  | "error";

const ACTIVE_STEPS: Step[] = [
  "uploading-image",
  "nfc-signing",
  "uploading-meta",
  "nfc-submitting",
];

const STEP_LABELS: { step: Step; label: string }[] = [
  { step: "uploading-image", label: "Upload image → IPFS" },
  { step: "nfc-signing", label: "Tap your bracelet" },
  { step: "uploading-meta", label: "Upload metadata → IPFS" },
  { step: "nfc-submitting", label: "Recording on-chain" },
];

const BUTTON_LABELS: Partial<Record<Step, string>> = {
  idle: "Publish via NFC bracelet",
  "uploading-image": "Uploading…",
  "uploading-meta": "Uploading…",
  "nfc-signing": "Waiting for NFC…",
  "nfc-submitting": "Recording on-chain…",
  done: "Submitted!",
  error: "Try again",
};

export default function UploadClient() {
  const router = useRouter();
  const { setNfcAddress } = useContext(NfcIdentityContext);

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [hasNfc, setHasNfc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasNfc(isNfcAvailable());
  }, []);

  const currentStepIndex = ACTIVE_STEPS.indexOf(step);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setErrorMsg("");

    try {
      setStep("uploading-image");
      const imageCID = await uploadImage(file);

      // Sign with the bracelet BEFORE uploading metadata so we have
      // the real bracelet address to store as author in IPFS.
      setStep("nfc-signing");
      const hexPayload = Array.from(new TextEncoder().encode(imageCID.slice(0, 32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const sig = await signWithNfc(hexPayload, (evt: NfcStatusEvent) => {
        if (evt.cause === "init" && evt.method === "credential") {
          setStep("nfc-signing");
        }
      });

      // Identify the user in context so the gallery shows the mint button immediately.
      setNfcAddress(sig.signerAddress);

      setStep("uploading-meta");
      const metadataCID = await uploadMetadata({
        title: title.trim(),
        imageCID,
        imageMime: file.type || "image/jpeg",
        author: sig.signerAddress,
        timestamp: Date.now(),
      });

      const uri = `ipfs://${metadataCID}`;

      setStep("nfc-submitting");
      const res = await fetch("/api/nfc/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uri,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          hash: sig.hash,
          message: `0x${hexPayload}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Relay failed");

      setStep("done");
      setTimeout(() => router.push("/"), 2500);
    } catch (err: unknown) {
      console.error(err);
      const name = err instanceof Error ? err.name : "";
      let msg: string;
      if (name === "NFCMethodNotSupported") {
        msg = "NFC is not supported on this device.";
      } else if (name === "NFCPermissionRequestDenied") {
        msg = "NFC permission denied. Check your browser settings.";
      } else {
        msg = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      }
      if (msg.includes("pending submission")) {
        msg = "You already have a painting awaiting moderation.";
      } else if (msg.includes("already approved")) {
        msg = "You already have an approved painting on the gallery.";
      }
      setErrorMsg(msg);
      setStep("error");
    }
  };

  const isLoading = currentStepIndex >= 0;

  if (!hasNfc) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-8">
        <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">Add a painting</h1>
        <div className="empty-state flex flex-col items-center gap-5 py-16">
          <span className="text-4xl">📲</span>
          <p className="text-center text-sm text-muted">
            An NFC bracelet is required to submit a painting.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">Add a painting</h1>
      <p className="mb-8 text-sm text-muted">
        Image and metadata stored on IPFS. Submissions are moderated before they appear in the gallery.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div
          onClick={() => !isLoading && fileInputRef.current?.click()}
          className="card-brutalist relative flex aspect-[16/10] cursor-pointer flex-col items-center justify-center overflow-hidden"
          style={!preview ? { background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" } : undefined}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted">
              <span className="text-4xl">📷</span>
              <span className="text-sm font-semibold">Click to choose an image</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="section-title" style={{ margin: 0 }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My masterpiece"
            maxLength={80}
            disabled={isLoading}
            className="input-brutalist"
          />
        </div>

        {/* Progress steps */}
        {isLoading && (
          <ol className="flex flex-col gap-3 rounded-[var(--radius-sm)] border-2 border-line bg-ink/3 p-4">
            {STEP_LABELS.map(({ step: s, label }, idx) => {
              const done = idx < currentStepIndex;
              const active = idx === currentStepIndex;
              return (
                <li key={s} className="flex items-center gap-3">
                  {/* Step circle */}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      done
                        ? "border-success bg-success text-white"
                        : active
                        ? "border-accent bg-accent text-white animate-pulse"
                        : "border-line bg-paper text-muted"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      done ? "text-success" : active ? "text-accent" : "text-muted"
                    }`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {step === "done" && (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border-2 border-success bg-success-soft p-3 text-sm font-semibold text-success">
            ✓ Submitted for review. It will appear in the gallery after approval. Redirecting…
          </div>
        )}

        {step === "error" && (
          <div className="rounded-[var(--radius-sm)] border-2 border-danger bg-danger-soft p-3 text-sm text-danger">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !title.trim() || isLoading || step === "done"}
          className="btn-brutalist btn-primary justify-center py-3 text-base"
        >
          {BUTTON_LABELS[step] ?? "Publish via NFC bracelet"}
        </button>
      </form>
    </main>
  );
}
