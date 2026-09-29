import BrandMark from "@/components/BrandMark";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { siteConfig } from "@/config/site";
import { useLocale } from "@/context/LocaleContext";

export default function Header() {
  const { locale, content } = useLocale();

  return (
    <header className="sticky top-0 z-20 border-b border-gray-800 bg-black/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          {/* The header stays LTR in every locale, so the mark always leads. */}
          <BrandMark size={32} decorative className="h-8 w-8 shrink-0" />
          <div>
            <p className="text-sm font-semibold tracking-wide text-white" title={siteConfig.brandExpansion}>
              {siteConfig.brand}
              <span className="mx-2 text-gray-600">·</span>
              <span className="font-medium text-gray-300">{content.hero.pageName}</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{siteConfig.brandExpansion}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <nav className="flex flex-wrap gap-4 text-sm text-gray-400">
            {siteConfig.nav.map((item) => (
              <a key={item.id} href={item.href} className="transition hover:text-white">
                {item.label[locale]}
              </a>
            ))}
          </nav>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}

