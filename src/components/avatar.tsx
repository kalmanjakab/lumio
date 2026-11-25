import { cn } from "./ui";

export function Avatar({ url, name, size = 36, className }: { url: string | null; name: string; size?: number; className?: string }) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
