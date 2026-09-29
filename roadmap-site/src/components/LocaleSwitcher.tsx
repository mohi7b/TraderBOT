import { useLocale } from "@/context/LocaleContext";
import { LOCALE_LIST } from "@/utils/roadmap-data";

export default function LocaleSwitcher() {
  const { locale, setLocale, content } = useLocale();

  return (
    <nav aria-label={content.labels.language} className="flex flex-wrap items-center gap-2">
      {LOCALE_LIST.map((item) => {
        const isActive = item.code === locale;
        return (
          <button
            key={item.code}
            type="button"
            lang={item.code}
            dir={item.dir}
            aria-pressed={isActive}
            onClick={() => setLocale(item.code)}
            className={
              isActive
                ? "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700 hover:text-white"
            }
          >
            {item.nativeName}
          </button>
        );
      })}
    </nav>
  );
}
