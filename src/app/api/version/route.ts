// Az éppen futó szerver-build azonosítója. Az app ezzel veszi észre, ha új verzió jelent meg.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || "dev", version: process.env.NEXT_PUBLIC_APP_VERSION || "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
