import SectionTitle from "@/components/SectionTitle";
import TokenCard from "@/components/TokenCard";
import TokenMetrics from "@/components/TokenMetrics";
import { useLocale } from "@/context/LocaleContext";

/**
 * RADI ecosystem — Tokenomics: two rows of three static cards (each row is a
 * token group), followed by the supply-metrics block, the current-stage block
 * and the purchase call to action. The kicker and the section title are
 * language-independent; copy and metric labels come from the content files.
 */
export default function Token() {
  const { content } = useLocale();
  const { tokenSummary, ui } = content;

  return (
    <section id="token" className="snap-stop mx-auto max-w-7xl px-6 py-12">
      <p dir="ltr" className="mb-2 text-[0.7rem] font-semibold tracking-[0.35em] text-cyan-300 uppercase">
        {tokenSummary.badge}
      </p>
      <SectionTitle compact title={tokenSummary.title} subtitle={tokenSummary.intro} />

      {/*
        The two-rows-of-three structure is preserved by card order (the identity
        trio, then the economy trio) — the row captions are intentionally not
        rendered so the board stays compact.
      */}
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {tokenSummary.cards.map((card) => (
          <TokenCard key={card.id} card={card} />
        ))}
      </div>

      <TokenMetrics metrics={tokenSummary.metrics} plannedLabel={ui.planned} />
    </section>
  );
}

