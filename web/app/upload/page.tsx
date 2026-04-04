import ClientOnly from "@/components/ClientOnly";
import UploadClient from "@/components/UploadClient";

export default function UploadPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-xl px-5 py-8">
          <div className="mb-2 h-9 w-64 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
          <div className="h-4 w-80 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
        </main>
      }
    >
      <UploadClient />
    </ClientOnly>
  );
}
