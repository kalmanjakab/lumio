import Link from "next/link";
import { isAdmin } from "@/lib/server/auth";
import { adminBase, adminPasswordHash } from "@/lib/server/env";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminLogout } from "@/components/admin/admin-logout";
import { LogoMark } from "@/components/logo";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const base = adminBase();
  if (!(await isAdmin())) {
    return <AdminLogin configured={adminPasswordHash() !== null} base={base} />;
  }
  const links = [
    { href: base, label: "Tartalom" },
    { href: `${base}/users`, label: "Felhasználók" },
    { href: `${base}/settings`, label: "Beállítások" },
    { href: `${base}/hash`, label: "Jelszó-hash" },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={base} className="flex items-center gap-2 font-extrabold">
            <LogoMark className="size-7" /> Flashly admin
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm font-semibold">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <AdminLogout />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
