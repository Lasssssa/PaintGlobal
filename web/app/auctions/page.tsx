import ClientOnly from "@/components/ClientOnly";
import AuctionGalleryClient from "@/components/auction/AuctionGalleryClient";

export const metadata = {
  title: "Auctions — PaintGlobal",
};

export default function AuctionsPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="skeleton h-8 w-48 rounded mb-8" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="skeleton rounded-[var(--radius-base)]"
                style={{ height: 280 }}
              />
            ))}
          </div>
        </main>
      }
    >
      <AuctionGalleryClient />
    </ClientOnly>
  );
}
