import { NextResponse } from "next/server";
import { fetchMacroPath } from "@/lib/server/upstream";

/**
 * GET /api/macro?mode=&limit=
 * نمای کلی دامنه ماکرو → لیست گروه‌ها (proxy به /api/groups بک‌اند).
 * شکل خروجی بک‌اند:
 *   { groups: [{ key, title, canonical_indicators, endpoint }] }
 * پارامترهای query با allowlist عبور داده می‌شوند (normalizeQuery).
 */
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const result = await fetchMacroPath(["groups"], query);
  return NextResponse.json(result.body, { status: result.status });
}
