import ClientOnly from "@/components/ClientOnly";
import GalleryClient from "@/components/GalleryClient";

export default function GalleryPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="mb-8 h-9 w-48 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="card-brutalist animate-pulse"
                style={{ aspectRatio: "16/10", background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)" }}
              />
            ))}
          </div>
        </main>
      }
    >
      <GalleryClient />
    </ClientOnly>
  );
}
