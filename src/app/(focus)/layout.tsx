import { AppProviders } from "@/components/providers";
import { getClientViewer, getInitialSettings } from "@/lib/server/settings";
import { getLayoutActivity } from "@/lib/server/activity";

// Teljes képernyős nézetek (tanulási módok, belépés): nincs navigációs sáv.
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings, activity] = await Promise.all([getClientViewer(), getInitialSettings(), getLayoutActivity()]);
  return (
    <AppProviders initialSettings={settings} viewer={viewer} activity={activity}>
      {children}
    </AppProviders>
  );
}
