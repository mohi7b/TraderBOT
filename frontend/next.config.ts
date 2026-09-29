import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * هاست‌هایی که در حالت dev اجازهٔ دسترسی به منابع Next دارند.
 * چرا لازم است: Next 16 به‌صورت پیش‌فرض درخواست‌های cross-origin به منابع
 * dev (مثل /_next/hmr) را بلاک می‌کند. اگر صفحه را از IP عمومی سرور باز کنید،
 * کلاینت HMR بلاک می‌شود و رفتار صفحه ناپایدار می‌شود.
 * قابل override با env: ALLOWED_DEV_ORIGINS="a.example.com,b.localhost"
 */
const ALLOWED_DEV_ORIGINS = (
  process.env.ALLOWED_DEV_ORIGINS ??
  "195.248.240.102,localhost,127.0.0.1"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Route Handlers ما proxy به بک‌اند اصلی‌اند؛ هیچ مسیر کلاینتی به بک‌اند اصلی نمی‌رود.
  // آدرس بک‌اند فقط در env سمت سرور (MACRO_API_BASE) تعریف می‌شود.
  allowedDevOrigins: ALLOWED_DEV_ORIGINS,
  turbopack: {
    // ریشهٔ Turbopack = پوشهٔ frontend (جلو هشدار lock بیرونیِ ریشهٔ ریپو)
    root: path.resolve(process.cwd()),
  },
};

export default withNextIntl(nextConfig);
