"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

export function SearchBox({ initial }: { initial: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="relative block">
        <span className="sr-only">{t("title")}</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          autoFocus={!initial}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("placeholder")}
          className="h-12 w-full rounded-full border-2 border-border bg-surface pl-12 pr-4 text-base focus:border-primary focus:outline-none"
        />
      </label>
    </form>
  );
}
