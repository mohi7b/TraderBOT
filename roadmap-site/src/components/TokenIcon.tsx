import { isTokenIconName } from "@/utils/roadmap-data";

interface TokenIconProps {
  /** Icon key from TOKEN_ICON_NAMES; unknown keys fall back to the coin icon. */
  name: string;
  className?: string;
}

/**
 * Dependency-free icon set for the token cards, drawn to match the RADI look
 * (thin strokes, currentColor). Each glyph carries the card's concept:
 * seed → small supply that grows, split → 1% / 99% structure,
 * coins → main supply, engine → economic model core,
 * wallet → payments, lock → freeze / staking.
 */
export default function TokenIcon({ name, className = "h-5 w-5" }: TokenIconProps) {
  const key = isTokenIconName(name) ? name : "coins";

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {key === "seed" ? (
        <>
          <path d="M5.5 19c0-6.5 4.5-11 11-11.6" />
          <path d="M12.9 4.5h4.5v4.5" />
          <circle cx="5.8" cy="18.7" r="1.9" />
        </>
      ) : null}

      {key === "split" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 12V4a8 8 0 0 0 1.1 15.9Z" />
        </>
      ) : null}

      {key === "coins" ? (
        <>
          <ellipse cx="12" cy="7" rx="6" ry="2.4" />
          <path d="M6 7v5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V7" />
          <path d="M6 12v5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-5" />
        </>
      ) : null}

      {key === "engine" ? (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M19 12h2.6" />
          <path d="M15.5 18.1l1.3 2.25" />
          <path d="M8.5 18.1l-1.3 2.25" />
          <path d="M5 12H2.4" />
          <path d="M8.5 5.9 7.2 3.65" />
          <path d="M15.5 5.9l1.3-2.25" />
          <circle cx="12" cy="12" r="1.1" />
        </>
      ) : null}

      {key === "wallet" ? (
        <>
          <path d="M4 9.6h13.2a2.8 2.8 0 0 1 2.8 2.8v4.4a2.3 2.3 0 0 1-2.3 2.3H6.3A2.3 2.3 0 0 1 4 16.8V9.6Z" />
          <path d="M4 9.6V7.5A2.5 2.5 0 0 1 6.5 5h8" />
          <circle cx="16.6" cy="14.3" r="1.2" />
        </>
      ) : null}

      {key === "lock" ? (
        <>
          <rect x="5" y="10.8" width="14" height="9.2" rx="2.2" />
          <path d="M8.6 10.8V8.6a3.4 3.4 0 0 1 6.8 0v2.2" />
          <circle cx="12" cy="15.4" r="1.2" />
        </>
      ) : null}
    </svg>
  );
}
