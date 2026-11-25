import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Flashly admin" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div lang="hu" className="min-h-dvh bg-bg">
        {children}
      </div>
    </ToastProvider>
  );
}
