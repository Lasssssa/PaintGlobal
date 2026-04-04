"use client";

import { useState, useRef, ChangeEvent, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { uploadImage, uploadMetadata } from "@/lib/storage";
import { isNfcAvailable, signWithNfc, type NfcStatusEvent } from "@/lib/nfc";

type Step =
  | "idle"
  | "uploading-image"
  | "uploading-meta"
  | "nfc-signing"
  | "nfc-submitting"
  | "confirming"
  | "done"
  | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "Publish painting",
  "uploading-image": "Uploading image to IPFS…",
  "uploading-meta": "Uploading metadata to IPFS…",
  "nfc-signing": "Waiting for NFC scan…",
  "nfc-submitting": "Recording on-chain…",
  confirming: "Confirm the transaction…",
  done: "Published!",
  error: "Try again",
};

export default function UploadClient() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

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

  const { writeContract, data: txHash, error: writeError } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && step === "confirming") {
      setStep("done");
      setTimeout(() => router.push("/"), 2000);
    }
  }, [isConfirmed, step, router]);

  useEffect(() => {
    if (writeError && step === "confirming") {
      setStep("error");
      setErrorMsg(writeError.message.slice(0, 160));
    }
  }, [writeError, step]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmitWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim() || !address) return;

    setErrorMsg("");

    try {
      setStep("uploading-image");
      const imageCID = await uploadImage(file);

      setStep("uploading-meta");
      const metadataCID = await uploadMetadata({
        title: title.trim(),
        imageCID,
        imageMime: file.type || "image/jpeg",
        author: address,
        timestamp: Date.now(),
      });

      setStep("confirming");
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "addPainting",
        args: [`ipfs://${metadataCID}`],
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.slice(0, 200));
      setStep("error");
    }
  };

  const handleSubmitNfc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setErrorMsg("");

    try {
      setStep("uploading-image");
      const imageCID = await uploadImage(file);

      setStep("uploading-meta");
      const metadataCID = await uploadMetadata({
        title: title.trim(),
        imageCID,
        imageMime: file.type || "image/jpeg",
        author: "nfc-bracelet",
        timestamp: Date.now(),
      });

      const uri = `ipfs://${metadataCID}`;

      setStep("nfc-signing");
      const nfcMessage = metadataCID.slice(0, 32);
      const hexPayload = Array.from(new TextEncoder().encode(nfcMessage))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const sig = await signWithNfc(hexPayload, (evt: NfcStatusEvent) => {
        if (evt.cause === "init" && evt.method === "credential") {
          setStep("nfc-signing");
        }
      });

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
      setTimeout(() => router.push("/"), 2000);
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
      setErrorMsg(msg);
      setStep("error");
    }
  };

  const isLoading = step !== "idle" && step !== "done" && step !== "error";
  const canShowForm = isConnected || hasNfc;

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <h1 className="mb-1 text-3xl font-bold tracking-[-0.03em] text-ink">Add a painting</h1>
      <p className="mb-8 text-sm text-muted">
        Image and metadata stored on IPFS, support recorded on-chain on ARC.
      </p>

      {!canShowForm ? (
        <div className="empty-state flex flex-col items-center gap-5">
          <span className="text-4xl">🔒</span>
          <p className="text-sm text-muted">Connect your wallet to upload a painting.</p>
          <ConnectButton />
        </div>
      ) : (
        <form
          onSubmit={isConnected ? handleSubmitWallet : handleSubmitNfc}
          className="flex flex-col gap-5"
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            className="card-brutalist relative flex aspect-[16/10] cursor-pointer flex-col items-center justify-center"
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
              className="input-brutalist"
            />
          </div>

          {isLoading && (
            <div className="card-brutalist p-4" style={{ boxShadow: "none" }}>
              <div className="flex flex-col gap-2 text-sm">
                <StepRow
                  label="Upload image → IPFS"
                  done={step !== "uploading-image"}
                  active={step === "uploading-image"}
                />
                <StepRow
                  label="Upload metadata → IPFS"
                  done={["nfc-signing", "nfc-submitting", "confirming"].includes(step)}
                  active={step === "uploading-meta"}
                />
                {isConnected ? (
                  <StepRow
                    label="Recording on-chain"
                    done={false}
                    active={step === "confirming"}
                  />
                ) : (
                  <>
                    <StepRow
                      label="Tap your bracelet"
                      done={step === "nfc-submitting"}
                      active={step === "nfc-signing"}
                    />
                    <StepRow
                      label="Recording on-chain"
                      done={false}
                      active={step === "nfc-submitting"}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border-2 border-success bg-success-soft p-3 text-sm font-semibold text-success">
              ✓ Painting published! Redirecting…
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
            {isConnected ? STEP_LABELS[step] : (
              step === "idle" ? "Publish via NFC" : STEP_LABELS[step]
            )}
          </button>

          {!isConnected && hasNfc && (
            <p className="text-center text-xs text-muted">
              No wallet? Tap your NFC bracelet to publish.
            </p>
          )}
        </form>
      )}
    </main>
  );
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${done ? "text-success font-semibold" : active ? "text-accent animate-pulse font-semibold" : "text-muted"}`}>
      <span>{done ? "✓" : active ? "⟳" : "○"}</span>
      <span>{label}</span>
    </div>
  );
}
