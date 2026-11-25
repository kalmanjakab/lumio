"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { House, Library, Users, Search, Settings as SettingsIcon, LogOut, Moon, ShieldCheck, LogIn } from "lucide-react";
import { Logo } from "../logo";
import { Avatar } from "../avatar";
import { cn } from "../ui";
import { useSettings } from "../providers";
import { InstallBar } from "./install-bar";
import { MustChangePassword } from "./must-change-password";
import { api } from "@/lib/client/api";

const NAV = [
  { href: "/", key: "home", icon: House },
  { href: "/library", key: "library", icon: Library },
  { href: "/groups", key: "groups", icon: Users },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { viewer } = useSettings();

  if (viewer.kind === "user" && viewer.mustChangePassword) {
    return <MustChangePassword />;
  }

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-[70] rounded-full bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("skipToContent")}
      </a>

      {/* Asztali oldalsáv */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-bg px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-3" aria-label="Flashly">
          <Logo />
        </Link>
        <nav aria-label={t("mainNav")} className="flex flex-col gap-1">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-3 py-2.5 font-semibold transition-colors",
                  active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className="size-6" aria-hidden />
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-4 sm:px-6 lg:pb-12 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Mobil alsó sáv */}
      <nav
        aria-label={t("mainNav")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur pb-safe lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 py-2.5 text-xs font-semibold", active ? "text-primary" : "text-muted")}
                >
                  <Icon className="size-6" aria-hidden />
                  {t(key)}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/settings"
              aria-current={isActive(pathname, "/settings") ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-xs font-semibold",
                isActive(pathname, "/settings") ? "text-primary" : "text-muted",
              )}
            >
              {viewer.kind === "user" ? (
                <Avatar
                  url={viewer.avatarUrl}
                  name={viewer.username}
                  size={24}
                  className={cn(isActive(pathname, "/settings") && "ring-2 ring-primary")}
                />
              ) : (
                <SettingsIcon className="size-6" aria-hidden />
              )}
              {t("settings")}
            </Link>
          </li>
        </ul>
      </nav>

      <InstallBar />
    </div>
  );
}

function TopBar() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { viewer } = useSettings();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur pt-safe">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="lg:hidden" aria-label="Flashly">
          <Logo />
        </Link>
        <form
          role="search"
          className="ml-auto hidden flex-1 sm:block lg:ml-0 lg:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-full border-2 border-transparent bg-surface-2 pl-11 pr-4 text-[0.95rem] placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
            />
          </label>
        </form>
        <Link
          href="/search"
          aria-label={t("search")}
          title={t("search")}
          className="ml-auto flex size-11 items-center justify-center rounded-full hover:bg-surface-2 sm:hidden"
        >
          <Search className="size-6" aria-hidden />
        </Link>
        <div className="hidden lg:block lg:ml-auto">
          {viewer.kind === "user" ? (
            <AccountMenu />
          ) : (
            <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">
              <LogIn className="size-4" aria-hidden />
              {t("login")}
            </Link>
          )}
        </div>
        {viewer.kind === "guest" ? (
          <Link href="/login" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary lg:hidden">
            {t("login")}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function AccountMenu() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { viewer, settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (viewer.kind !== "user") return null;
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("accountMenu")}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full"
      >
        <Avatar url={viewer.avatarUrl} name={viewer.username} size={40} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 z-50 w-72 animate-pop-in overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Avatar url={viewer.avatarUrl} name={viewer.username} size={48} />
            <p className="truncate font-bold">{viewer.username}</p>
          </div>
          <div className="py-1">
            <MenuItem
              icon={<SettingsIcon className="size-5" aria-hidden />}
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
            >
              {t("settings")}
            </MenuItem>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={dark}
              onClick={() => update({ theme: dark ? "light" : "dark" })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left font-medium text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Moon className="size-5" aria-hidden />
              <span className="flex-1">{t("darkMode")}</span>
              <span className={cn("relative h-5 w-9 rounded-full", dark ? "bg-primary" : "bg-surface-3")} aria-hidden>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all", dark ? "left-[1.15rem]" : "left-0.5")} />
              </span>
            </button>
          </div>
          <div className="border-t border-border py-1">
            <MenuItem icon={<LogOut className="size-5" aria-hidden />} onClick={logout}>
              {t("logout")}
            </MenuItem>
          </div>
          <div className="border-t border-border py-1">
            <MenuItem
              icon={<ShieldCheck className="size-5" aria-hidden />}
              onClick={() => {
                setOpen(false);
                router.push("/settings/privacy");
              }}
            >
              {t("privacy")}
            </MenuItem>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left font-medium text-muted hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      {children}
    </button>
  );
}
