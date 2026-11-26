/* eslint-disable @next/next/no-img-element */
import { cn } from "./ui";

/** Kártyához tartozó kép. A kép a jelentés oldalán jelenik meg; a szöveg mellett kiegészítő szerepű. */
export function CardImage({ id, className, size = "md" }: { id: string | null | undefined; className?: string; size?: "sm" | "md" | "lg" }) {
  if (!id) return null;
  const h = size === "sm" ? "max-h-16 max-w-24" : size === "lg" ? "max-h-48 sm:max-h-64" : "max-h-28 sm:max-h-36";
  return <img src={`/img/${id}`} alt="" loading="lazy" decoding="async" draggable={false} className={cn("mx-auto rounded-xl object-contain", h, className)} />;
}
