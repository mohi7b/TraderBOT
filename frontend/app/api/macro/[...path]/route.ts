import { NextResponse } from "next/server";
import { fetchMacroPath } from "@/lib/server/upstream";
import { groupByKey } from "@/lib/server/macro";

/**
 * GET /api/macro/<segment...>?mode=&limit=&canon=&group=
 * پشتیبانی از سه شکل ورودی (برای راحتی Domain/Client):
 *   /api/macro/inflation          → /api/inflation
 *   /api/macro/1A_inflation       → /api/inflation (نگاشت گروه)
 *   /api/macro/groups             → /api/groups
 *   /api/macro/health             → /api/health
 *
 * پارامترهای query **عبور داده می‌شوند** تا منوی کشورها و چارت‌های مقطعی کار کنند:
 *   /api/macro/1A_inflation?mode=countries   → ۱۷ کشور (country-first)
 *   /api/macro/1A_inflation?mode=countries&limit=30
 * پالایش/allowlist در `lib/server/upstream.ts` انجام می‌شود (هیچ پارامتر
 * ناشناسی به بک‌اند نمی‌رود).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const segments = Array.isArray(path) ? path : [];

  // نگاشت کلید گروه (1A_inflation/1B_growth/1C_labor) به مسیر بک‌اند
  const mappedSegments: string[] =
    segments.length === 1
      ? [groupByKey(segments[0]!)?.path ?? segments[0]!]
      : segments;

  const query = new URL(req.url).searchParams;
  const result = await fetchMacroPath(mappedSegments, query);
  return NextResponse.json(result.body, { status: result.status });
}

