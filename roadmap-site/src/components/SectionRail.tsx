import { useEffect, useState } from "react";

export interface RailItem {
  /** DOM id of the target section. */
  id: string;
  /** Localized label shown on hover/focus. */
  label: string;
}

interface SectionRailProps {
  items: readonly RailItem[];
  /** Accessible name of the navigation. */
  label: string;
  onSelect: (id: string) => void;
}

/**
 * Vertical dot navigation aligned with the scroll-snap stops.
 * The active dot follows the section crossing the middle of the viewport.
 */
export default function SectionRail({ items, label, onSelect }: SectionRailProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label={label}
      dir="ltr"
      className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 flex-col items-end gap-2.5 lg:flex"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "true" : undefined}
            title={item.label}
            className="group flex items-center gap-2"
          >
            <span
              dir="auto"
              className="pointer-events-none max-w-0 truncate rounded-md bg-gray-900/90 py-1 text-xs text-gray-300 opacity-0 transition-all duration-300 group-hover:max-w-[16rem] group-hover:px-2 group-hover:opacity-100 group-focus-visible:max-w-[16rem] group-focus-visible:px-2 group-focus-visible:opacity-100"
            >
              {item.label}
            </span>
            <span
              aria-hidden
              className={
                isActive
                  ? "h-2.5 w-2.5 rounded-full bg-blue-400 ring-2 ring-blue-500/30"
                  : "h-2 w-2 rounded-full bg-gray-600 transition group-hover:bg-gray-400"
              }
            />
          </button>
        );
      })}
    </nav>
  );
}
