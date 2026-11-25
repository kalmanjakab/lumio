import { getGlobalThresholds } from "@/lib/server/app-settings";
import { GlobalThresholdsForm } from "@/components/admin/admin-forms";

export default async function AdminSettingsPage() {
  const t = await getGlobalThresholds();
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-extrabold">Beállítások</h1>
      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-1 font-bold">Teszt osztályzat-küszöbök (globális)</h2>
        <p className="mb-4 text-sm text-muted">Minden készletre érvényes, ahol nincs saját küszöb beállítva.</p>
        <GlobalThresholdsForm initial={t} />
      </section>
    </div>
  );
}
