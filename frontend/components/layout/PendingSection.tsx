import { getTranslations } from "next-intl/server";

/**
 * P0 placeholder — بخش‌هایی که بک‌اندشان هنوز آماده نیست (Rاهکار ۵).
 * بعداً با Panel واقعی همان دامنه جایگزین می‌شود.
 */
export async function PendingSection({ domain }: { domain: string }) {
  const t = await getTranslations("common");
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">{domain}</h1>
        <span className="text-xs text-muted">/dashboard/{domain}</span>
      </header>
      <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">{t("state.pending")}</p>
      </div>
    </section>
  );
}
