import TokenIcon from "@/components/TokenIcon";
import type { TokenCardContent } from "@/utils/roadmap-data";

interface TokenCardProps {
  card: TokenCardContent;
}

/**
 * Compact tokenomics card: large icon on the left of the copy, then the spec
 * rows as plain paragraphs (`○ Label: value`) — no boxes and no expansion, so
 * the whole board stays short and scannable.
 */
export default function TokenCard({ card }: TokenCardProps) {
  return (
    <article
      id={`token-${card.id}`}
      className="anchor-offset reveal flex h-full flex-col rounded-2xl border border-gray-800 bg-gray-950/60 p-4 transition-colors duration-300 hover:border-cyan-500/40"
    >
      <header className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
          <TokenIcon name={card.icon} className="h-7 w-7" />
        </span>

        <div className="min-w-0">
          <h3 className="text-base font-bold text-white md:text-lg">{card.title}</h3>
          {card.subtitle.map((line) => (
            <p key={line} className="mt-0.5 text-[0.72rem] leading-snug text-cyan-200/80">
              {line}
            </p>
          ))}
        </div>
      </header>

      <ul className="mt-4 space-y-2">
        {card.fields.map((field) => (
          <li key={field.label} className="flex gap-2 text-[0.8rem] leading-relaxed">
            <span
              aria-hidden
              className="mt-[0.42rem] h-1.5 w-1.5 shrink-0 rounded-full border border-cyan-400/70"
            />
            <span className="text-gray-400">
              <span className="font-semibold text-gray-300">{field.label}:</span> {field.value}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

