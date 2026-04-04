import ClientOnly from "@/components/ClientOnly";
import LeaderboardClient from "@/components/LeaderboardClient";

export default function LeaderboardPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-3xl px-5 py-8">
          <div className="mb-2 h-9 w-48 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
          <div className="mb-8 h-4 w-72 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
          <div className="flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="card-brutalist h-20 animate-pulse"
                style={{ background: "linear-gradient(135deg, #f4f0ff, #e8e4f0)", boxShadow: "none" }}
              />
            ))}
          </div>
        </main>
      }
    >
      <LeaderboardClient />
    </ClientOnly>
  );
}
