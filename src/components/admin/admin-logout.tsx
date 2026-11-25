"use client";

import { api } from "@/lib/client/api";

export function AdminLogout() {
  return (
    <button
      type="button"
      onClick={async () => {
        await api("/api/admin/logout", { method: "POST", body: {} }).catch(() => {});
        window.location.reload();
      }}
      className="rounded-full px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger-soft"
    >
      Kijelentkezés
    </button>
  );
}
