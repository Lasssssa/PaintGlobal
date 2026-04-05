import ClientOnly from "@/components/ClientOnly";
import MyAuctionsClient from "@/components/auction/MyAuctionsClient";

export const metadata = {
  title: "My Auctions — PaintGlobal",
};

export default function MyAuctionsPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="skeleton h-8 w-48 rounded mb-8" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="skeleton rounded-[var(--radius-base)]"
                style={{ height: 180 }}
              />
            ))}
          </div>
        </main>
      }
    >
      <MyAuctionsClient />
    </ClientOnly>
  );
}
