import ar from "@/content/roadmap/ar.json";
import de from "@/content/roadmap/de.json";
import en from "@/content/roadmap/en.json";
import fa from "@/content/roadmap/fa.json";
import tr from "@/content/roadmap/tr.json";

export type Locale = "en" | "fa" | "ar" | "tr" | "de";
export type Direction = "ltr" | "rtl";

export interface ComponentRef {
  readonly id: string;
  readonly name: string;
}

export interface PhaseTimeline {
  readonly start: string;
  readonly end: string;
  readonly label: string;
}

export interface Phase {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly components: readonly string[];
  readonly deliverables: readonly string[];
  readonly milestones: readonly string[];
  readonly timeline: PhaseTimeline;
}

export interface Pillar {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly summary: string;
  readonly components: readonly ComponentRef[];
  readonly phases: readonly Phase[];
}

export interface RoadmapDependency {
  readonly from: string;
  readonly to: string;
  readonly note: string;
}

export interface PillarExitCriteria {
  readonly pillarId: string;
  readonly criteria: readonly string[];
}

export interface RoadmapLabels {
  readonly language: string;
  readonly pillars: string;
  readonly phases: string;
  readonly phase: string;
  readonly description: string;
  readonly deliverables: string;
  readonly milestones: string;
  readonly timeline: string;
  readonly components: string;
  readonly dependencies: string;
  readonly criticalPath: string;
  readonly exitCriteria: string;
  readonly programExit: string;
  readonly principles: string;
  readonly timelineOverview: string;
  readonly summary: string;
}

export interface HeroContent {
  /** Brand name of the platform (never translated). First headline line. */
  readonly brand: string;
  /** What the brand stands for. Second headline line. */
  readonly tagline: string;
  /** Third headline line: what this page is about. Language-independent. */
  readonly pageName: string;
  /** Hero paragraph shown under the three-line headline. */
  readonly subtitle: string;
  /** Primary call-to-action label (links to the roadmap section). */
  readonly ctaRoadmap: string;
  /** Secondary call-to-action label (links to the architecture section). */
  readonly ctaArchitecture: string;
}

export interface UiLabels {
  /** Label of the floating scroll-snap toggle. */
  readonly snapLabel: string;
  readonly snapOn: string;
  readonly snapOff: string;
  /** Pillar accordion controls. */
  readonly openLabel: string;
  readonly closeLabel: string;
  readonly collapseAll: string;
  readonly expandAll: string;
  /** "+{n} more" hint for clamped component lists. */
  readonly moreComponents: string;
  /** Collapsible long lists (dependencies table). */
  readonly showAll: string;
  readonly showLess: string;
  /** Marker for artefacts that are planned but not shipped yet. */
  readonly planned: string;
  /** Accessible label of the section rail navigation. */
  readonly railLabel: string;
}

/** Canonical icon keys used by the token cards. */
export const TOKEN_ICON_NAMES = ["seed", "split", "coins", "engine", "wallet", "lock"] as const;
export type TokenIconName = (typeof TOKEN_ICON_NAMES)[number];

export function isTokenIconName(value: string): value is TokenIconName {
  return (TOKEN_ICON_NAMES as readonly string[]).includes(value);
}

export interface TokenGroup {
  readonly id: string;
  readonly label: string;
}

/** One "label: value" spec row inside a tokenomics card. */
export interface TokenField {
  readonly label: string;
  readonly value: string;
}

export interface TokenCardContent {
  readonly id: string;
  /** Group this card belongs to (renders as one row of three). */
  readonly group: string;
  /** Icon key from TOKEN_ICON_NAMES. */
  readonly icon: string;
  readonly title: string;
  /** One to three subtitle lines (share/mechanic, then the absolute figure). */
  readonly subtitle: readonly string[];
  /** Spec rows rendered directly on the card — cards are no longer collapsible. */
  readonly fields: readonly TokenField[];
}

export interface TokenMetricRow {
  readonly id: string;
  readonly label: string;
  readonly total: string;
  readonly released: string;
  readonly percent: string;
  readonly multiplier: string;
  /** Pre-supply style emphasis (gold + glow). */
  readonly highlight: boolean;
}

export interface TokenConversion {
  readonly fromValue: string;
  readonly fromLabel: string;
  readonly toValue: string;
  readonly toLabel: string;
  readonly caption: string;
}

export interface TokenStageItem {
  readonly label: string;
  readonly value: string;
}

export interface TokenMetricsContent {
  readonly columnLabels: {
    readonly label: string;
    readonly total: string;
    readonly released: string;
    readonly percent: string;
    readonly multiplier: string;
  };
  readonly rows: readonly TokenMetricRow[];
  readonly conversion: TokenConversion;
  readonly stage: {
    readonly title: string;
    readonly value: string;
    readonly items: readonly TokenStageItem[];
  };
  readonly cta: { readonly label: string; readonly note: string };
}

export interface TokenSummaryContent {
  /** Language-independent kicker ("Token Summary"). */
  readonly badge: string;
  readonly title: string;
  readonly intro: string;
  readonly groups: readonly TokenGroup[];
  readonly cards: readonly TokenCardContent[];
  readonly metrics: TokenMetricsContent;
}

export interface RoadmapMeta {
  readonly documentTitle: string;
  readonly tagline: string;
  readonly intro: string;
  readonly principles: readonly string[];
  readonly programExitCriteria: readonly string[];
}

export interface RoadmapContent {
  readonly locale: Locale;
  readonly languageName: string;
  readonly nativeName: string;
  readonly dir: Direction;
  readonly meta: RoadmapMeta;
  readonly labels: RoadmapLabels;
  readonly hero: HeroContent;
  readonly ui: UiLabels;
  readonly tokenSummary: TokenSummaryContent;
  readonly pillars: readonly Pillar[];
  readonly dependencies: readonly RoadmapDependency[];
  readonly criticalPath: readonly string[];
  readonly exitCriteria: readonly PillarExitCriteria[];
}

export interface ArchitectureComponent {
  readonly id: string;
  readonly name: string;
}

export interface ArchitecturePillar {
  readonly id: string;
  readonly name: string;
  readonly components: readonly ArchitectureComponent[];
}

/**
 * The approved architecture. These identifiers and English names mirror the
 * specification exactly; validateRoadmap() fails if a localized roadmap adds,
 * drops or renames a pillar or a component.
 */
export const ARCHITECTURE_PILLARS: readonly ArchitecturePillar[] = [
  {
    id: "data-lake",
    name: "Data Lake",
    components: [
      { id: "fetcher-engine", name: "Fetcher Engine (multi-source)" },
      { id: "normalizer-engine", name: "Normalizer Engine" },
      { id: "weighting-engine", name: "Weighting Engine" },
      { id: "noise-filter-engine", name: "Noise Filter Engine" },
      { id: "tsdb", name: "TSDB (Time-Series Database)" },
      { id: "data-quality-monitor", name: "Data Quality Monitor" }
    ]
  },
  {
    id: "chart-engine",
    name: "Chart Engine (WASM + WebGL)",
    components: [
      { id: "gpu-accelerated-rendering", name: "GPU accelerated rendering" },
      { id: "multi-layer-charting", name: "Multi-layer charting" },
      { id: "custom-shaders", name: "Custom shaders" },
      { id: "indicator-engine", name: "Indicator engine" },
      { id: "event-overlays", name: "Event overlays" },
      { id: "high-frequency-rendering-pipeline", name: "High-frequency rendering pipeline" }
    ]
  },
  {
    id: "bot-builder",
    name: "Bot Builder (Node-Based)",
    components: [
      { id: "node-graph-editor", name: "Node graph editor" },
      { id: "node-interpreter", name: "Node interpreter" },
      { id: "strategy-compiler", name: "Strategy compiler" },
      { id: "backtesting-engine", name: "Backtesting engine" },
      { id: "live-trading-executor", name: "Live trading executor" },
      { id: "risk-management-module", name: "Risk management module" }
    ]
  },
  {
    id: "ai-engine",
    name: "AI Engine",
    components: [
      { id: "signal-generation", name: "Signal generation" },
      { id: "pattern-detection", name: "Pattern detection" },
      { id: "market-regime-classifier", name: "Market regime classifier" },
      { id: "reinforcement-learning-module", name: "Reinforcement learning module" },
      { id: "model-training-pipeline", name: "Model training pipeline" }
    ]
  },
  {
    id: "token-economy",
    name: "Token Economy",
    components: [
      { id: "utility-model", name: "Utility model" },
      { id: "staking-system", name: "Staking system" },
      { id: "reward-distribution", name: "Reward distribution" },
      { id: "burn-mechanism", name: "Burn mechanism" },
      { id: "governance-model", name: "Governance model" }
    ]
  },
  {
    id: "marketplace",
    name: "Marketplace",
    components: [
      { id: "strategy-marketplace", name: "Strategy marketplace" },
      { id: "indicator-marketplace", name: "Indicator marketplace" },
      { id: "ai-model-marketplace", name: "AI model marketplace" },
      { id: "creator-economy", name: "Creator economy" }
    ]
  }
] as const;

export interface LocaleDescriptor {
  readonly code: Locale;
  readonly name: string;
  readonly nativeName: string;
  readonly dir: Direction;
}

export const LOCALE_LIST: readonly LocaleDescriptor[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "fa", name: "Persian (Farsi)", nativeName: "فارسی", dir: "rtl" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" }
] as const;

export const DEFAULT_LOCALE: Locale = "en";

/** Canonical token-summary structure (shared by every locale). */
export const TOKEN_CARD_IDS = [
  "pre-token",
  "total-supply",
  "main-token",
  "economic-engine",
  "utility",
  "staking"
] as const;
export const TOKEN_GROUP_IDS = ["identity", "economy"] as const;
export const TOKEN_METRIC_ROW_IDS = ["pre", "main"] as const;
/** Every tokenomics card exposes the same number of spec rows. */
export const TOKEN_FIELDS_PER_CARD = 4;

const LOCALE_CODES: readonly string[] = LOCALE_LIST.map((locale) => locale.code);

export function isLocale(value: string): value is Locale {
  return LOCALE_CODES.includes(value);
}

/* ------------------------------------------------------------------ *
 * Runtime validation
 *
 * Every localized content file goes through this check on module load,
 * so a missing or invented architecture component fails fast instead of
 * silently shipping a simplified roadmap.
 * ------------------------------------------------------------------ */

export function validateRoadmap(content: RoadmapContent): string[] {
  const issues: string[] = [];
  const tag = `[${content.locale}]`;

  if (!LOCALE_CODES.includes(content.locale)) issues.push(`${tag} unknown locale`);
  if (content.dir !== "ltr" && content.dir !== "rtl") issues.push(`${tag} invalid dir "${content.dir}"`);

  (["brand", "tagline", "pageName", "subtitle", "ctaRoadmap", "ctaArchitecture"] as const).forEach((key) => {
    if (!content.hero || !content.hero[key]) issues.push(`${tag} hero.${key} is missing`);
  });

  const UI_KEYS = [
    "snapLabel",
    "snapOn",
    "snapOff",
    "openLabel",
    "closeLabel",
    "collapseAll",
    "expandAll",
    "moreComponents",
    "showAll",
    "showLess",
    "planned",
    "railLabel"
  ] as const;

  UI_KEYS.forEach((key) => {
    if (!content.ui || !content.ui[key]) issues.push(`${tag} ui.${key} is missing`);
  });
  if (content.ui && content.ui.moreComponents.indexOf("{n}") === -1) {
    issues.push(`${tag} ui.moreComponents must contain {n}`);
  }

  if (!content.tokenSummary) {
    issues.push(`${tag} tokenSummary is missing`);
  } else {
    const summary = content.tokenSummary;

    if (summary.groups.length !== TOKEN_GROUP_IDS.length) {
      issues.push(`${tag} expected ${TOKEN_GROUP_IDS.length} token groups, found ${summary.groups.length}`);
    }
    summary.groups.forEach((group, index) => {
      const expectedId = TOKEN_GROUP_IDS[index];
      if (expectedId && group.id !== expectedId) {
        issues.push(`${tag} token group ${index + 1} is "${group.id}", expected "${expectedId}"`);
      }
    });

    if (summary.cards.length !== TOKEN_CARD_IDS.length) {
      issues.push(`${tag} expected ${TOKEN_CARD_IDS.length} token cards, found ${summary.cards.length}`);
    }
    summary.cards.forEach((card, index) => {
      const expectedId = TOKEN_CARD_IDS[index];
      if (expectedId && card.id !== expectedId) {
        issues.push(`${tag} token card ${index + 1} is "${card.id}", expected "${expectedId}"`);
      }
      if (!TOKEN_GROUP_IDS.includes(card.group as (typeof TOKEN_GROUP_IDS)[number])) {
        issues.push(`${tag} token card "${card.id}" has unknown group "${card.group}"`);
      }
      if (!isTokenIconName(card.icon)) {
        issues.push(`${tag} token card "${card.id}" has unknown icon "${card.icon}"`);
      }
      if (card.subtitle.length === 0 || card.subtitle.length > 3) {
        issues.push(
          `${tag} token card "${card.id}" needs 1-3 subtitle lines, found ${card.subtitle.length}`
        );
      }
      if (card.fields.length !== TOKEN_FIELDS_PER_CARD) {
        issues.push(
          `${tag} token card "${card.id}" must expose ${TOKEN_FIELDS_PER_CARD} spec rows, found ${card.fields.length}`
        );
      }
      card.fields.forEach((field) => {
        if (!field.label || !field.value) {
          issues.push(`${tag} token card "${card.id}" has a spec row without label or value`);
        }
      });
    });
    TOKEN_GROUP_IDS.forEach((groupId) => {
      const count = summary.cards.filter((card) => card.group === groupId).length;
      if (count !== 3) issues.push(`${tag} token group "${groupId}" must hold exactly 3 cards, found ${count}`);
    });

    const metrics = summary.metrics;
    if (metrics.rows.length !== TOKEN_METRIC_ROW_IDS.length) {
      issues.push(`${tag} expected ${TOKEN_METRIC_ROW_IDS.length} metric rows, found ${metrics.rows.length}`);
    }
    metrics.rows.forEach((row, index) => {
      const expectedId = TOKEN_METRIC_ROW_IDS[index];
      if (expectedId && row.id !== expectedId) {
        issues.push(`${tag} metric row ${index + 1} is "${row.id}", expected "${expectedId}"`);
      }
      (["total", "released", "percent", "multiplier"] as const).forEach((key) => {
        if (!row[key]) issues.push(`${tag} metric row "${row.id}" is missing ${key}`);
      });
    });
    if (metrics.stage.items.length === 0) issues.push(`${tag} token stage block has no items`);
    if (!metrics.cta.label || !metrics.cta.note) issues.push(`${tag} token CTA label and note are required`);
  }

  if (content.pillars.length !== ARCHITECTURE_PILLARS.length) {
    issues.push(`${tag} expected ${ARCHITECTURE_PILLARS.length} pillars, found ${content.pillars.length}`);
  }

  ARCHITECTURE_PILLARS.forEach((expected, index) => {
    const pillar = content.pillars[index];
    if (!pillar) {
      issues.push(`${tag} missing pillar "${expected.id}"`);
      return;
    }
    if (pillar.id !== expected.id) {
      issues.push(`${tag} pillar ${index + 1} is "${pillar.id}", expected "${expected.id}"`);
    }

    const ids = pillar.components.map((component) => component.id);
    const expectedIds = expected.components.map((component) => component.id);
    expectedIds.forEach((id) => {
      if (!ids.includes(id)) issues.push(`${tag} ${expected.id} is missing component "${id}"`);
    });
    ids.forEach((id) => {
      if (!expectedIds.includes(id)) issues.push(`${tag} ${expected.id} introduces unapproved component "${id}"`);
    });

    pillar.phases.forEach((phase) => {
      phase.components.forEach((id) => {
        if (!expectedIds.includes(id)) issues.push(`${tag} ${phase.id} references unknown component "${id}"`);
      });
      if (phase.deliverables.length === 0) issues.push(`${tag} ${phase.id} has no deliverables`);
      if (phase.milestones.length === 0) issues.push(`${tag} ${phase.id} has no technical milestones`);
      if (!phase.timeline.start || !phase.timeline.end || !phase.timeline.label) {
        issues.push(`${tag} ${phase.id} has an incomplete timeline`);
      }
    });
  });

  const phaseIds = content.pillars.flatMap((pillar) => pillar.phases.map((phase) => phase.id));
  if (new Set(phaseIds).size !== phaseIds.length) issues.push(`${tag} duplicate phase ids`);
  content.criticalPath.forEach((id) => {
    if (!phaseIds.includes(id)) issues.push(`${tag} critical path references unknown phase "${id}"`);
  });
  content.dependencies.forEach((dependency) => {
    if (!phaseIds.includes(dependency.from)) issues.push(`${tag} dependency source "${dependency.from}" is unknown`);
    if (!phaseIds.includes(dependency.to)) issues.push(`${tag} dependency target "${dependency.to}" is unknown`);
  });

  return issues;
}

function defineRoadmap(raw: unknown): RoadmapContent {
  const content = raw as RoadmapContent;
  const issues = validateRoadmap(content);
  if (issues.length > 0) {
    throw new Error(`Invalid roadmap content:\n${issues.join("\n")}`);
  }
  return content;
}

/** All five localized roadmaps, validated at load time. */
export const ROADMAPS: Record<Locale, RoadmapContent> = {
  en: defineRoadmap(en),
  fa: defineRoadmap(fa),
  ar: defineRoadmap(ar),
  tr: defineRoadmap(tr),
  de: defineRoadmap(de)
};

export function getRoadmap(locale: Locale): RoadmapContent {
  return ROADMAPS[locale] ?? ROADMAPS[DEFAULT_LOCALE];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function getAllPhases(content: RoadmapContent): readonly Phase[] {
  return content.pillars.flatMap((pillar) => pillar.phases);
}

export function countPhases(content: RoadmapContent): number {
  return getAllPhases(content).length;
}

export function findPillar(content: RoadmapContent, pillarId: string): Pillar | undefined {
  return content.pillars.find((pillar) => pillar.id === pillarId);
}

/** "Phase 7" / "فاز ۷" — the localized reference for a phase id. */
export function localizePhaseRef(content: RoadmapContent, phaseId: string): string {
  const phase = getAllPhases(content).find((item) => item.id === phaseId);
  return content.labels.phase.replace("{n}", String(phase ? phase.order : phaseId));
}

/** Earliest start quarter and latest end quarter across every phase. */
export function timelineRange(content: RoadmapContent): { start: string; end: string } {
  const phases = getAllPhases(content);
  const starts = phases.map((phase) => phase.timeline.start);
  const ends = phases.map((phase) => phase.timeline.end);
  return {
    start: starts.sort((a, b) => quarterRank(a) - quarterRank(b))[0] ?? "",
    end: ends.sort((a, b) => quarterRank(b) - quarterRank(a))[0] ?? ""
  };
}

export function quarterRank(value: string): number {
  const match = /Q([1-4])\s*(\d{4})/.exec(value);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 4 + Number(match[1]);
}
