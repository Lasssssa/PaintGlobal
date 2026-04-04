import ClientOnly from "@/components/ClientOnly";
import AdminClient from "@/components/AdminClient";

export default function AdminPage() {
  return (
    <ClientOnly
      fallback={
        <main className="mx-auto w-full max-w-2xl px-5 py-8">
          <div className="mb-2 h-9 w-48 animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
          <div className="h-4 w-full max-w-md animate-pulse rounded-[var(--radius-sm)] bg-ink/5" />
        </main>
      }
    >
      <AdminClient />
    </ClientOnly>
  );
}
