import ClientOnly from "@/components/ClientOnly";
import AuctionDetailClient from "@/components/auction/AuctionDetailClient";

export const metadata = {
  title: "Auction — PaintGlobal",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AuctionDetailPage({ params }: Props) {
  const { id } = await params;
  const auctionId = parseInt(id, 10);

  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="skeleton rounded-[var(--radius-base)]" style={{ aspectRatio: "1" }} />
            <div className="flex flex-col gap-4">
              {[80, 180, 200].map((h, i) => (
                <div key={i} className="skeleton rounded-[var(--radius-sm)]" style={{ height: h }} />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <AuctionDetailClient auctionId={auctionId} />
    </ClientOnly>
  );
}
