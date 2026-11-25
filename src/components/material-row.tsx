import Link from "next/link";
import { Layers, Lock, Users } from "lucide-react";

export function MaterialRow({ href, title, meta, matched }: { href: string; title: string; meta: string; matched?: string | null }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl p-2 transition-colors hover:bg-surface-2">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Layers className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-fg group-hover:text-primary">{title}</span>
        <span className="block truncate text-sm text-muted">{meta}</span>
        {matched ? <span className="block truncate text-sm text-muted">{matched}</span> : null}
      </span>
    </Link>
  );
}

export function GroupTile({ href, name, meta, locked }: { href: string; name: string; meta: string; locked: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card transition-colors hover:bg-surface-2">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${locked ? "bg-surface-2 text-muted" : "bg-primary-soft text-primary"}`}>
        {locked ? <Lock className="size-5" aria-hidden /> : <Users className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold">{name}</span>
        <span className="block truncate text-sm text-muted">{meta}</span>
      </span>
    </Link>
  );
}
