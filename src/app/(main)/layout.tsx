import { AppProviders } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { getClientViewer, getInitialSettings } from "@/lib/server/settings";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([getClientViewer(), getInitialSettings()]);
  return (
    <AppProviders initialSettings={settings} viewer={viewer}>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
