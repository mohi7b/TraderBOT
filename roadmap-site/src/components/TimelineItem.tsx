import type { Phase, RoadmapLabels } from "@/utils/roadmap-data";

interface TimelineItemProps {
  phase: Phase;
  labels: RoadmapLabels;
  /** Component id → localized component name. */
  componentNames: Map<string, string>;
}

export default function TimelineItem({ phase, labels, componentNames }: TimelineItemProps) {
  return (
    <article className="relative border-s border-gray-800 pb-10 ps-5 last:pb-0">
      <span aria-hidden className="absolute -start-1.5 top-1.5 h-3 w-3 rounded-full bg-blue-500" />

      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-lg font-semibold text-white">{phase.title}</h4>
        <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-300">
          {phase.timeline.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-gray-300">{phase.description}</p>

      {phase.components.length > 0 ? (
        <p className="mt-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-400">{labels.components}: </span>
          {phase.components.map((id) => componentNames.get(id) ?? id).join(" · ")}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{labels.deliverables}</h5>
          <ul className="mt-2 list-disc space-y-1.5 ps-4 text-sm text-gray-300">
            {phase.deliverables.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{labels.milestones}</h5>
          <ul className="mt-2 list-disc space-y-1.5 ps-4 text-sm text-gray-300">
            {phase.milestones.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">{labels.timeline}: </span>
        {phase.timeline.label}
      </p>
    </article>
  );
}

