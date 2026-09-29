# RADI — Technical Roadmap

**RADI** stands for *Real-time Autonomous Data Intelligence*; this page is its **Technical Roadmap**.

A multilingual roadmap / whitepaper site (Next.js 16 · Pages Router · TypeScript strict · Tailwind v4)
for a large-scale financial data intelligence platform.

## Architecture described by the roadmap

The roadmap strictly follows the approved architecture — nothing is added, nothing is simplified:

1. **Data Lake** — Fetcher Engine (multi-source) · Normalizer Engine · Weighting Engine ·
   Noise Filter Engine · TSDB (Time-Series Database) · Data Quality Monitor
2. **Chart Engine (WASM + WebGL)** — GPU accelerated rendering · Multi-layer charting ·
   Custom shaders · Indicator engine · Event overlays · High-frequency rendering pipeline
3. **Bot Builder (Node-Based)** — Node graph editor · Node interpreter · Strategy compiler ·
   Backtesting engine · Live trading executor · Risk management module
4. **AI Engine** — Signal generation · Pattern detection · Market regime classifier ·
   Reinforcement learning module · Model training pipeline
5. **Token Economy** — Utility model · Staking system · Reward distribution · Burn mechanism ·
   Governance model
6. **Marketplace** — Strategy marketplace · Indicator marketplace · AI model marketplace ·
   Creator economy

## Languages

Five languages with **identical structure and identical numbers** (17 phases, Q4 2026 → Q4 2029):

| Code | Language      | Direction |
|------|---------------|-----------|
| `en` | English       | LTR       |
| `fa` | فارسی         | RTL       |
| `ar` | العربية       | RTL       |
| `tr` | Türkçe        | LTR       |
| `de` | Deutsch       | LTR       |

## Content pipeline

`src/content/roadmap/<locale>.json` is the single source of truth. Each file is validated on load
(`src/utils/roadmap-data.ts`) against the approved architecture: a missing, renamed or invented
pillar/component fails fast.

```bash
npm run roadmap:build   # validate all locales + regenerate ROADMAP.md
npm run roadmap:check   # validate only (CI friendly)
npm run roadmap:mirror  # English-first: copy en blocks into the other locales
```

### English-first workflow

While the English copy is still being iterated on, **only `src/content/roadmap/en.json` is edited**.
The multilingual validator is strict by design (it compares structure and numbers across all five
languages), so after an English-only change run:

```bash
npm run roadmap:mirror              # mirrors `tokenSummary` into fa/ar/tr/de (placeholders)
npm run roadmap:mirror tokenSummary hero   # or pick specific blocks
```

The other locales then carry the English block verbatim — clearly "pending localization" — which
keeps `roadmap:check`, the build and `ROADMAP.md` green without any translation effort. Once the
English text is approved, the four locales are localized in a single pass and `roadmap:mirror` is no
longer needed for that block.

`ROADMAP.md` in the repository root is generated from those files, so the Markdown whitepaper and
the website can never drift apart.

## Brand assets (image pipeline)

The emblem ships as pre-generated, transparent, metadata-free rasters — no runtime image service and
no 637 KB source in `public/`:

```bash
npm run images:build                                     # "brand" tone → public/brand + both icons
npm run images:build -- --tones=brand,gold --icons=gold   # extra tone sets, icon colour
npm run images:build -- --tones=gold --out=/tmp/preview   # experiments, nothing written to the repo
```

| Output | Purpose |
|--------|---------|
| `public/brand/radi-coin-{384,256,128,64}.{webp,png}` | `<BrandMark />` in the header, hero and token CTA (`srcSet` + `sizes` + intrinsic size) |
| `public/brand/radi-coin-<tone>-*.{webp,png}` | Optional recolours: `gold`, `blue`, `violet`, `emerald`, `crimson`, `white`, `graphite` |
| `public/favicon-32.png`, `public/apple-touch-icon.png` | Linked from `src/pages/_document.tsx` |

`assets/radi-coin-source.jfif` is a 1408×768 JPEG screenshot of the emblem rendered on the
transparency checkerboard (637 KB, C2PA manifest included), so it cannot be served as-is: the
checkerboard would show through on the black page. `scripts/optimize-images.mjs` therefore keys it
out with a **two-term test** — dark neutral greys become transparent, while only strongly saturated
pixels survive on their own — then removes the JPEG speckles with a 3×3 median (hand-written: sharp's
own `.median()` corrupts a 1-channel buffer), crops to the alpha bounding box and centres the mark on
a square canvas with a 4 % transparent margin. WebP is the primary format (q84, alpha preserved) and
palette PNG the fallback; the icons use 128/256-colour palettes. A real transparent PNG dropped in at
the same path is keyed as a no-op, so the pipeline keeps working.

Recolouring has two routes:

- **Build-time tone sets** (exact colour, available to CSS-free consumers — favicons, social cards,
  PWA icons): `<BrandMark tone="gold" />` reads the tone set, so it must have been generated
  (`--tones=brand,gold`) or the browser 404s. Colours live in the `TONES` table: `hue`/`saturation`/
  `brightness` are multipliers for sharp's `modulate()` measured against the cyan source, while
  `tint: "#rrggbb"` repaints the mark in one exact colour and keeps alpha plus the luminance ramp so
  the facets stay readable.
- **Runtime recolouring** (no extra bytes, any colour or theme): Tailwind filter utilities on
  `className`, e.g. `className="hue-rotate-[205deg] saturate-125"` or `"grayscale brightness-150"`.

## Getting Started

```bash
npm install
npm run dev        # http://localhost:4500
npm run build
npm start
```

## Project layout

```
src/
  components/          BrandMark, Header, LocaleSwitcher, SnapToggle, SectionRail, SectionTitle,
                       NeuralBackground, RoadmapCard, TimelineItem, TokenCard
  config/site.ts       Site + navigation + locale configuration
  content/roadmap/     en.json fa.json ar.json tr.json de.json  (source of truth)
  context/             LocaleContext (locale + RTL switching)
  pages/               _app.tsx, _document.tsx (icon links), index.tsx
  sections/            Hero, Token, Roadmap
  styles/globals.css   Tailwind v4 entry point, scroll-snap + reveal rules
  utils/roadmap-data.ts Types, canonical architecture registry, validator, helpers
scripts/
  generate-roadmap-md.mjs   ROADMAP.md generator + parity validator
  optimize-images.mjs       brand emblem → transparent WebP/PNG + favicons (npm run images:build)
```

## Token Summary section

The second section on the page (`#token`, linked from the header nav) is titled **RADI Ecosystem —
Tokenomics**: six compact spec cards flowing as two rows of three, followed by a supply-metrics
block. The row captions are intentionally not rendered (the two-rows-of-three structure is kept by
card order), and nothing is collapsible — the board is meant to be read in one pass, so spacing and
typography are deliberately dense (`SectionTitle` with `compact`, `gap-3` grid, `p-4` cards,
`py-12` section).

| Row | Cards |
|-----|-------|
| 1 | Pre-Supply Token · Total Supply · Main Token |
| 2 | Economic Engine · Utility · Staking |

- Each card places a large icon (`TokenIcon.tsx`: seed, split, coins, engine, wallet, lock) to the
  **left of its copy** — title and the two subtitle lines sit beside it — followed by four spec rows
  rendered as plain paragraphs (`○ Release Model: …`). No boxes around the rows and no stacked
  header: this keeps every card short and scannable.
- Below the cards, `TokenMetrics.tsx` renders the supply table (the pre-supply row in gold with a
  glow on its `×10` multiplier), the `1 pre-supply token = 10 main tokens` conversion graphic, the
  current-stage block and the neon "Buy Samara token" call to action with its grey note.
- `siteConfig.buyTokenUrl` currently points at `#token`; replace it with the official RADI wallet or
  partner-exchange URL once it exists.
- Content lives in the `tokenSummary` block of every locale file; the kicker (`RADI Ecosystem`) and
  the title (`Tokenomics`) are language-independent brand elements, while intro, card copy and
  metric labels are localized.
- Planned vs. shipped: the metrics block carries the localized `ui.planned` marker, so the figures
  are read as the planned model rather than live data.
- Validated structure: two fixed groups with exactly three cards each, fixed card ids/order/icons,
  1–3 subtitle lines per card, exactly four spec rows per card and two metric rows — and the digits
  inside every value must match across the five languages (translated sentences are fine, different
  numbers are not).
- The same content is rendered into `ROADMAP.md`, so the page and the whitepaper cannot drift.

## Language switching

The active language lives in `LocaleContext`. Direction is applied to the **content wrapper**
(`<main dir={dir}>` in `src/pages/index.tsx`), not to `<html>`: Persian and Arabic roadmap content
renders right-to-left with logical Tailwind utilities (`ps-*`, `border-s`, `-start-*`), while the
sticky header, its navigation and the language switcher always stay LTR and left aligned — the menu
is never mirrored.

`<html lang>` still follows the active locale, and every localized string (hero copy, section
labels, roadmap content) is read from the content files, so the page has no hard-coded copy.

## Hero copy & brand identity

The first section of the page renders a three-line headline that is **brand identity** — identical
and always English in every language, and always rendered LTR so it never mirrors in RTL locales:

1. `brand` — `RADI` (largest line, gradient)
2. `tagline` — `Real-time Autonomous Data Intelligence`
3. `pageName` — `The Future Architecture of Trading`

Everything else in the hero is localized per language (`subtitle`, `ctaRoadmap`, `ctaArchitecture`):

```json
"hero": {
  "brand": "RADI",
  "tagline": "Real-time Autonomous Data Intelligence",
  "pageName": "The Future Architecture of Trading",
  "subtitle": "پلتفرم هوشمند تجمیع دادههای مالی، چارت انجین اختصاصی، …",
  "ctaRoadmap": "مشاهده Roadmap",
  "ctaArchitecture": "معماری سیستم"
}
```

`meta.documentTitle` (`RADI — Technical Roadmap`) is used for the browser tab title, the roadmap
section heading and the `ROADMAP.md` headline; it is also language-independent.

The rule is enforced, not just documented: `npm run roadmap:check` fails if any locale changes
`brand`, `tagline`, `pageName` or `documentTitle`, and also fails if a localized `subtitle` or CTA
label is missing.

## UI features

### 1. Neural background (`NeuralBackground.tsx`)

A very transparent canvas mesh (brand blue edges, sky nodes) sits behind the hero headline.
Cheap by design: ~14–80 neurons scaled to the viewport, O(n²) links over that small set, capped
`devicePixelRatio`, and it stops rendering entirely when the hero leaves the viewport or the tab is
hidden. `prefers-reduced-motion` gets a single static frame instead of animation. The canvas is
`aria-hidden`, `pointer-events-none`, and masked with a radial gradient so it fades out before the
next section. Hovering the hero headline "warms up" the mesh: the opacity level lerps to ~1.9×
while the pointer is over the `<h1>`, and with reduced motion the single static frame is repainted
at the target intensity instead.

### 2. Scroll snapping (opt-in)

`globals.css` enables `scroll-snap-type: y proximity` only while `<html data-snap="on">` is set;
`<SnapToggle />` (floating button, bottom-left) owns that attribute and remembers the choice in
`localStorage`.

- Snap stops: the hero (header + titles), the pillar-grid heading, every **collapsed** pillar card,
  the dependencies table and the exit-criteria grid.
- `proximity` is used on purpose — `mandatory` fights the long sections (17-row table, expanded
  cards).
- `.snap-stop` / `.pillar-anchor` carry `scroll-margin-top: 5.5rem` so the sticky header never
  covers a snapped heading.
- The toggle hides itself when the browser lacks scroll-snap support or the user prefers reduced
  motion (`useSyncExternalStore` + media-query subscription, no setState-in-effect).
- A pillar card drops `snap-stop` while expanded, so a long open card can be read freely.

### 3. Pillar accordion — hybrid layout (`RoadmapCard.tsx`)

- **Collapsed:** six equal-height tiles in a `md:grid-cols-2 xl:grid-cols-3` grid. Each tile shows
  its number, title, a 3-line clamped summary, the first two component chips (`+N more`), the phase
  count and the timeline range — with the expand button anchored via `mt-auto` so tiles align.
- **Expanded:** the tile becomes `col-span-full` and reveals all phases in a responsive grid, so
  three phases sit side by side instead of stacking.
- **Animation:** the `grid-template-rows: 0fr → 1fr` technique with `overflow: hidden` — no JS
  height measuring, and the phase content stays mounted (all 17 phases remain in the served HTML).
- Any number of pillars can be open: **expand all** / **collapse all** actions sit next to the grid
  heading, `aria-expanded` / `aria-controls` are on each button, `aria-hidden` marks collapsed
  panels and `motion-reduce:` variants disable the animation.
- Deep links: `/#data-lake` opens that pillar and scrolls to it, and the open set is mirrored into a
  shareable `?open=data-lake,ai-engine` parameter (`history.replaceState`, no router churn).

### 4. Section rail (`SectionRail.tsx`)

A fixed dot rail on the right (lg and up) mirrors every snap stop: hero, the pillar-grid heading,
the six pillars, the dependencies table and the exit criteria. The active dot follows the section
crossing the middle of the viewport (`IntersectionObserver` with a `-45%/-45%` root margin), labels
appear on hover/focus, clicking a pillar dot opens it before scrolling, and the nav carries
`aria-label` + `aria-current`. It is pinned LTR so its geometry never mirrors in RTL.

### 5. Reveal on scroll & collapsible long sections

- `.reveal` uses a pure CSS scroll-driven animation (`animation-timeline: view()` behind an
  `@supports` guard): browsers without support render the content immediately, so there is no JS,
  no layout shift and no flash of hidden content. Pillar cards, the dependencies block and the
  exit-criteria grid use it.
- The 23-row dependencies table shows the first 5 rows by default with a "Show all (23)" /
  "Show less" toggle, which keeps the initial scroll short.

## Notes

- `tsconfig.json` maps `@/*` to `./src/*` and excludes `.next/dev` (Next generates two copies of
  `types/validator.ts` during dev + build, which otherwise breaks `tsc --noEmit`).
- The `hero` block is validated together with the roadmap structure: a locale without hero copy
  fails `npm run roadmap:check`.
- `/dashboard`-style private routes are out of scope for this marketing site; only the public
  roadmap/whitepaper surface is implemented here.
