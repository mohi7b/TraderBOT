import { getTranslations } from "next-intl/server";
import { HeaderControls } from "@/components/layout/HeaderControls";
import { SideNav } from "@/components/layout/SideNav";

/**
 * Dashboard shell — ریسپانسیو از موبایل تا UltraWide.
 * چیدمان: Sidebar در lg+، و یک topbar همیشه حاضر در بالای محتوا.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("common");

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop/tablet */}
      <aside className="hidden lg:flex lg:w-56 xl:w-64 2xl:w-72 flex-col border-e border-border bg-surface">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="font-semibold">{t("app.title")}</span>
          <span className="text-xs text-muted">{t("app.subtitle")}</span>
        </div>
        <SideNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="font-semibold">{t("app.title")}</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <HeaderControls />
          </div>
        </header>

        {/* Content — grid اجباری روی سایزهای مختلف */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[2560px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
