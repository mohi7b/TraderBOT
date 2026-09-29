import TimelineItem from "@/components/TimelineItem";
import type { Pillar, RoadmapContent } from "@/utils/roadmap-data";

interface RoadmapCardProps {
  pillar: Pillar;
  content: RoadmapContent;
  /** Accordion state of this pillar. */
  isOpen: boolean;
  onToggle: (pillarId: string) => void;
}

/** How many component chips stay visible while the card is collapsed. */
const COLLAPSED_CHIPS = 2;

/**
 * Hybrid pillar card:
 * - collapsed  → equal-height tile inside the pillar grid, and a scroll-snap stop
 * - expanded   → spans the full grid width and reveals every phase, animated
 *                with the `grid-template-rows: 0fr → 1fr` technique (no JS measuring).
 */
export default function RoadmapCard({ pillar, content, isOpen, onToggle }: RoadmapCardProps) {
  const componentNames = new Map(
    content.pillars.flatMap((item) => item.components.map((component) => [component.id, component.name] as const))
  );

  const firstPhase = pillar.phases[0];
  const lastPhase = pillar.phases[pillar.phases.length - 1];
  const visibleComponents = pillar.components.slice(0, COLLAPSED_CHIPS);
  const hiddenComponents = pillar.components.length - visibleComponents.length;
  const panelId = `${pillar.id}-panel`;

  return (
    <article
      id={pillar.id}
      className={[
        "anchor-offset reveal flex h-full flex-col rounded-2xl border p-6 transition-colors duration-300",
        isOpen
          ? "col-span-full border-blue-500/50 bg-gray-950/80"
          : "snap-stop border-gray-800 bg-gray-950/60 hover:border-blue-500/40"
      ].join(" ")}
    >
      <header>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-sm font-bold text-blue-300">
            {pillar.order}
          </span>
          <h3 className="text-lg font-bold text-white md:text-xl">{pillar.title}</h3>
        </div>

        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-gray-400">{pillar.summary}</p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {visibleComponents.map((component) => (
            <li
              key={component.id}
              className="max-w-full truncate rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1 text-xs text-gray-300"
            >
              {component.name}
            </li>
          ))}
          {hiddenComponents > 0 ? (
            <li className="rounded-full border border-gray-800 bg-gray-900/70 px-2.5 py-1 text-xs text-gray-500">
              {content.ui.moreComponents.replace("{n}", String(hiddenComponents))}
            </li>
          ) : null}
        </ul>

        {firstPhase && lastPhase ? (
          <p className="mt-4 text-xs text-gray-500">
            <span className="font-semibold text-gray-400">{content.labels.phases}: </span>
            {pillar.phases.length} · {firstPhase.timeline.start} – {lastPhase.timeline.end}
          </p>
        ) : null}
      </header>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => onToggle(pillar.id)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-blue-500/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {isOpen ? content.ui.closeLabel : content.ui.openLabel}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div
        id={panelId}
        aria-hidden={!isOpen}
        className={`grid overflow-hidden transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="grid gap-8 pt-8 lg:grid-cols-2 2xl:grid-cols-3">
            {pillar.phases.map((phase) => (
              <TimelineItem key={phase.id} phase={phase} labels={content.labels} componentNames={componentNames} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

