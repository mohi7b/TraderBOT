import { useEffect, useSyncExternalStore } from "react";

import { useLocale } from "@/context/LocaleContext";

const STORAGE_KEY = "radi:snap";
const SNAP_EVENT = "radi:snap-change";

type SnapState = "on" | "off" | "hidden";

/** Snapshot of the external snap state (localStorage + media query + DOM support). */
function getSnapshot(): SnapState {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supported = typeof CSS !== "undefined" && CSS.supports("scroll-snap-type: y proximity");
  if (reduceMotion || !supported) return "hidden";
  return window.localStorage.getItem(STORAGE_KEY) === "off" ? "off" : "on";
}

/** Nothing is rendered before hydration, so SSR/SSG stays markup-free here. */
function getServerSnapshot(): SnapState {
  return "hidden";
}

function subscribe(onChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener(SNAP_EVENT, onChange);
  window.addEventListener("storage", onChange);
  mediaQuery.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(SNAP_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    mediaQuery.removeEventListener("change", onChange);
  };
}

/**
 * Floating switch for the opt-in scroll snapping.
 * - hidden when the browser lacks scroll-snap support or the user prefers reduced motion
 * - the choice is remembered in localStorage
 */
export default function SnapToggle() {
  const { content } = useLocale();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Mirrors the state onto <html data-snap> so globals.css can enable snapping.
  useEffect(() => {
    if (state === "hidden") {
      document.documentElement.removeAttribute("data-snap");
      return;
    }
    document.documentElement.dataset.snap = state;
  }, [state]);

  if (state === "hidden") return null;

  const toggle = () => {
    const next = state === "on" ? "off" : "on";
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(SNAP_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state === "on"}
      title={content.ui.snapLabel}
      className="fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/80 px-4 py-2 text-xs font-medium text-gray-300 backdrop-blur transition hover:border-blue-500/50 hover:text-white"
    >
      <span
        aria-hidden
        className={state === "on" ? "h-2 w-2 rounded-full bg-blue-400" : "h-2 w-2 rounded-full bg-gray-600"}
      />
      {content.ui.snapLabel}: {state === "on" ? content.ui.snapOn : content.ui.snapOff}
    </button>
  );
}
