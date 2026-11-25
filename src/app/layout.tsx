import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "@fontsource-variable/figtree";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: { default: "Flashly", template: "%s · Flashly" },
    description: `Flashly – ${t("logoSuffix")}`,
    applicationName: "Flashly",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Flashly", statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/icons/icon.svg", type: "image/svg+xml" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1417" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const jar = await cookies();
  const theme = jar.get("flashly_theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang={locale} data-theme={dataTheme} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
