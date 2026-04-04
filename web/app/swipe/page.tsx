import ClientOnly from "@/components/ClientOnly";
import SwipeClient from "@/components/SwipeClient";

export default function SwipePage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-xl px-5 py-8 text-center">
          <div className="mb-4 h-9 w-48 animate-pulse rounded-[var(--radius-sm)] bg-ink/5 mx-auto" />
          <div className="card-brutalist animate-pulse p-10">
            <div className="flex flex-col items-center gap-4">
              <div className="h-64 w-full rounded bg-ink/10" />
              <div className="h-4 w-2/3 rounded bg-ink/10" />
            </div>
          </div>
        </main>
      }
    >
      <SwipeClient />
    </ClientOnly>
  );
}
