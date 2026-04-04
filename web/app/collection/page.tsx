import ClientOnly from "@/components/ClientOnly";
import CollectionClient from "@/components/CollectionClient";

export const metadata = {
  title: "My Collection — PaintGlobal",
};

export default function CollectionPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="skeleton rounded-[var(--radius-base)]"
                style={{ aspectRatio: "4/3" }}
              />
            ))}
          </div>
        </main>
      }
    >
      <CollectionClient />
    </ClientOnly>
  );
}
