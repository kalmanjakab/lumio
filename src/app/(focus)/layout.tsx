import { AppProviders } from "@/components/providers";
import { getClientViewer, getInitialSettings } from "@/lib/server/settings";

// Teljes képernyős nézetek (tanulási módok, belépés): nincs navigációs sáv.
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([getClientViewer(), getInitialSettings()]);
  return (
    <AppProviders initialSettings={settings} viewer={viewer}>
      {children}
    </AppProviders>
  );
}
