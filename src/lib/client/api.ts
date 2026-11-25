"use client";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; keepalive?: boolean; form?: FormData } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      keepalive: opts.keepalive,
      headers: opts.form ? undefined : opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "network");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* üres válasz */
  }
  if (!res.ok) throw new ApiClientError(res.status, String(data.error ?? "error"), data);
  return data as T;
}

/** Háttérben mentés: a hibát csak naplózzuk, a tanulást nem akasztjuk meg. */
export function fireAndForget(path: string, body: unknown, method = "POST") {
  api(path, { method, body, keepalive: true }).catch((e) => console.warn("[mentés]", path, e?.code ?? e));
}
