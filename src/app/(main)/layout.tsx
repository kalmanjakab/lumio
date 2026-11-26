import { AppProviders } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { getClientViewer, getInitialSettings } from "@/lib/server/settings";
import { getLayoutActivity } from "@/lib/server/activity";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings, activity] = await Promise.all([getClientViewer(), getInitialSettings(), getLayoutActivity()]);
  return (
    <AppProviders initialSettings={settings} viewer={viewer} activity={activity}>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
