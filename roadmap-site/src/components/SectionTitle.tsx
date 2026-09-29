interface SectionTitleProps {
  title: string;
  subtitle?: string;
  id?: string;
  /** Tighter spacing and typography for dense sections (e.g. Tokenomics). */
  compact?: boolean;
}

export default function SectionTitle({ title, subtitle, id, compact = false }: SectionTitleProps) {
  return (
    <header id={id} className={compact ? "mb-4" : "mb-8"}>
      <h2 className={compact ? "text-xl font-bold text-white md:text-2xl" : "text-2xl font-bold text-white md:text-4xl"}>
        {title}
      </h2>
      {subtitle ? (
        <p
          className={
            compact
              ? "mt-2 max-w-4xl text-sm leading-relaxed text-gray-400"
              : "mt-4 max-w-4xl text-base leading-relaxed text-gray-400"
          }
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

