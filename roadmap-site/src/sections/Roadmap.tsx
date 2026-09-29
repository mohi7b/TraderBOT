import { useEffect, useMemo, useState } from "react";

import RoadmapCard from "@/components/RoadmapCard";
import SectionRail from "@/components/SectionRail";
import type { RailItem } from "@/components/SectionRail";
import SectionTitle from "@/components/SectionTitle";
import { useLocale } from "@/context/LocaleContext";
import { countPhases, localizePhaseRef, timelineRange } from "@/utils/roadmap-data";

/** Dependency rows shown before the table has to be expanded. */
const DEPENDENCIES_PREVIEW = 5;

export default function Roadmap() {
  const { content } = useLocale();
  const { meta, labels } = content;
  const range = timelineRange(content);
  const moduleCount = content.pillars.reduce((sum, pillar) => sum + pillar.components.length, 0);
  /** Any number of pillars can be open; the URL keeps them shareable. */
  const [openPillars, setOpenPillars] = useState<string[]>([]);
  const [showAllDependencies, setShowAllDependencies] = useState(false);

  const visibleDependencies = showAllDependencies
    ? content.dependencies
    : content.dependencies.slice(0, DEPENDENCIES_PREVIEW);
  const allOpen = openPillars.length === content.pillars.length;

  // Deep links: `#data-lake` opens that pillar and scrolls to it,
  // `?open=data-lake,ai-engine` restores a shared set of open pillars.
  useEffect(() => {
    const applyLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = (params.get("open") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => content.pillars.some((pillar) => pillar.id === id));
      const hash = window.location.hash.replace("#", "");
      const hashed = content.pillars.some((pillar) => pillar.id === hash) ? [hash] : [];
      const next = Array.from(new Set([...fromQuery, ...hashed]));

      if (next.length === 0) return;
      setOpenPillars(next);

      if (hashed.length > 0) {
        window.requestAnimationFrame(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };

    // Deferred to the next frame: not a cascading render, and the layout has settled.
    const frame = window.requestAnimationFrame(applyLocation);
    window.addEventListener("hashchange", applyLocation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", applyLocation);
    };
  }, [content.pillars]);

  // Mirrors the accordion state into the shareable `?open=` parameter.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openPillars.length > 0) url.searchParams.set("open", openPillars.join(","));
    else url.searchParams.delete("open");
    window.history.replaceState(null, "", url);
  }, [openPillars]);

  const togglePillar = (pillarId: string) => {
    setOpenPillars((current) =>
      current.includes(pillarId) ? current.filter((id) => id !== pillarId) : [...current, pillarId]
    );
  };

  const railItems = useMemo<RailItem[]>(
    () => [
      { id: "hero", label: content.hero.pageName },
      { id: "token", label: content.tokenSummary.title },
      { id: "pillars", label: labels.pillars },
      ...content.pillars.map((pillar) => ({ id: pillar.id, label: pillar.title })),
      { id: "dependencies", label: labels.dependencies },
      { id: "exit-criteria", label: labels.exitCriteria }
    ],
    [
      content.hero.pageName,
      content.pillars,
      content.tokenSummary.title,
      labels.dependencies,
      labels.exitCriteria,
      labels.pillars
    ]
  );

  const handleRailSelect = (id: string) => {
    if (content.pillars.some((pillar) => pillar.id === id)) {
      setOpenPillars((current) => (current.includes(id) ? current : [...current, id]));
    }

    if (id === "hero") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="roadmap" className="mx-auto max-w-7xl px-6 py-20">
      <SectionTitle title={meta.documentTitle} subtitle={meta.intro} />
      <p className="mb-12 text-sm font-medium text-blue-300">{meta.tagline}</p>

      <div className="mb-12 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{labels.principles}</h3>
          <ul className="mt-3 list-disc space-y-2 ps-4 text-sm text-gray-300">
            {meta.principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{labels.timelineOverview}</h3>
          <p className="mt-3 text-sm text-gray-300">
            {content.pillars.length} {labels.pillars} · {moduleCount} {labels.components} · {countPhases(content)}{" "}
            {labels.phases} · {range.start} – {range.end}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-400">
            {content.pillars.map((pillar) => (
              <li key={pillar.id}>
                {pillar.title} — {pillar.phases[0]?.timeline.start} –{" "}
                {pillar.phases[pillar.phases.length - 1]?.timeline.end}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{labels.programExit}</h3>
          <ul className="mt-3 list-disc space-y-2 ps-4 text-sm text-gray-300">
            {meta.programExitCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="snap-stop mb-4 flex flex-wrap items-center justify-between gap-4">
        <h3 id="pillars" className="text-xl font-bold text-white md:text-2xl">
          {labels.pillars}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {!allOpen ? (
            <button
              type="button"
              onClick={() => setOpenPillars(content.pillars.map((pillar) => pillar.id))}
              className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-blue-500/50 hover:text-white"
            >
              {content.ui.expandAll}
            </button>
          ) : null}
          {openPillars.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpenPillars([])}
              className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-blue-500/50 hover:text-white"
            >
              {content.ui.collapseAll}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {content.pillars.map((pillar) => (
          <RoadmapCard
            key={pillar.id}
            pillar={pillar}
            content={content}
            isOpen={openPillars.includes(pillar.id)}
            onToggle={togglePillar}
          />
        ))}
      </div>

      <section id="dependencies" className="reveal snap-stop mt-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-white md:text-2xl">{labels.dependencies}</h3>
          {content.dependencies.length > DEPENDENCIES_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAllDependencies((current) => !current)}
              aria-expanded={showAllDependencies}
              className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-blue-500/50 hover:text-white"
            >
              {showAllDependencies
                ? content.ui.showLess
                : `${content.ui.showAll} (${content.dependencies.length})`}
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-gray-400">{labels.criticalPath}:</p>
        <p className="mt-1 text-sm text-blue-300">
          {content.criticalPath.map((phaseId) => localizePhaseRef(content, phaseId)).join(" → ")}
        </p>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-800">
          <table className="w-full border-collapse text-start text-sm">
            <thead className="bg-gray-900/80 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{labels.phases}</th>
                <th className="px-4 py-3 text-start font-semibold">{labels.description}</th>
              </tr>
            </thead>
            <tbody>
              {visibleDependencies.map((dependency) => (
                <tr key={`${dependency.from}-${dependency.to}`} className="border-t border-gray-800">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-200">
                    {localizePhaseRef(content, dependency.from)} → {localizePhaseRef(content, dependency.to)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{dependency.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="exit-criteria" className="reveal snap-stop mt-16">
        <h3 className="text-xl font-bold text-white md:text-2xl">{labels.exitCriteria}</h3>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {content.exitCriteria.map((entry) => {
            const pillar = content.pillars.find((item) => item.id === entry.pillarId);
            return (
              <div key={entry.pillarId} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6">
                <h4 className="text-sm font-semibold text-white">{pillar ? pillar.title : entry.pillarId}</h4>
                <ul className="mt-3 list-disc space-y-2 ps-4 text-sm text-gray-300">
                  {entry.criteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <SectionRail items={railItems} label={content.ui.railLabel} onSelect={handleRailSelect} />
    </section>
  );
}

