import ClientOnly from "@/components/ClientOnly";
import CreateAuctionStepper from "@/components/auction/CreateAuctionStepper";

export const metadata = {
  title: "Create Auction — PaintGlobal",
};

export default function CreateAuctionPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
          <div className="skeleton h-8 w-64 rounded mb-8" />
          <div className="mx-auto max-w-md">
            <div className="skeleton rounded-[var(--radius-base)]" style={{ height: 400 }} />
          </div>
        </main>
      }
    >
      <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
        <h1 className="sr-only">Create auction</h1>
        <CreateAuctionStepper />
      </main>
    </ClientOnly>
  );
}
