#!/usr/bin/env node
/**
 * Regenerates ROADMAP.md (the multilingual whitepaper) from the localized
 * content files in src/content/roadmap/<locale>.json.
 *
 * Usage:
 *   node scripts/generate-roadmap-md.mjs           validate + write ROADMAP.md
 *   node scripts/generate-roadmap-md.mjs --check   validate only
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(root, "src", "content", "roadmap");
const OUTPUT_FILE = join(root, "ROADMAP.md");

const LOCALES = ["en", "fa", "ar", "tr", "de"];
const PILLARS = [
  { id: "data-lake", en: "Data Lake", components: ["fetcher-engine", "normalizer-engine", "weighting-engine", "noise-filter-engine", "tsdb", "data-quality-monitor"] },
  { id: "chart-engine", en: "Chart Engine (WASM + WebGL)", components: ["gpu-accelerated-rendering", "multi-layer-charting", "custom-shaders", "indicator-engine", "event-overlays", "high-frequency-rendering-pipeline"] },
  { id: "bot-builder", en: "Bot Builder (Node-Based)", components: ["node-graph-editor", "node-interpreter", "strategy-compiler", "backtesting-engine", "live-trading-executor", "risk-management-module"] },
  { id: "ai-engine", en: "AI Engine", components: ["signal-generation", "pattern-detection", "market-regime-classifier", "reinforcement-learning-module", "model-training-pipeline"] },
  { id: "token-economy", en: "Token Economy", components: ["utility-model", "staking-system", "reward-distribution", "burn-mechanism", "governance-model"] },
  { id: "marketplace", en: "Marketplace", components: ["strategy-marketplace", "indicator-marketplace", "ai-model-marketplace", "creator-economy"] }
];

const cell = (value) => String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
/**
 * Digit groups only (with their internal separators): lets localized values be
 * compared across languages without punishing translated sentences. A row like
 * "×10 compared to the main token" and "×10 نسبت به توکن اصلی" both yield "10",
 * while a sentence without numbers yields an empty signature.
 */
const numericSignature = (value) =>
  (String(value).match(/\d[\d.,]*/g) || []).map((part) => part.replace(/[.,]+$/, "")).join("|");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function loadRoadmap(locale) {
  const file = join(CONTENT_DIR, `${locale}.json`);
  if (!existsSync(file)) throw new Error(`missing content file: ${file}`);
  return readJson(file);
}

function validate(content, reference) {
  const errors = [];
  const tag = `[${content.locale}]`;
  if (!LOCALES.includes(content.locale)) errors.push(`${tag} unknown locale`);
  if (!["ltr", "rtl"].includes(content.dir)) errors.push(`${tag} invalid dir`);
  if (content.meta.principles.length !== reference.meta.principles.length) errors.push(`${tag} principles count differs`);
  if (content.meta.programExitCriteria.length !== reference.meta.programExitCriteria.length) errors.push(`${tag} programExitCriteria count differs`);
  if (content.labels.phase.indexOf("{n}") === -1) errors.push(`${tag} labels.phase must contain {n}`);
  const heroFields = ["brand", "tagline", "pageName", "subtitle", "ctaRoadmap", "ctaArchitecture"];
  if (!content.hero || heroFields.some((field) => !content.hero[field])) {
    errors.push(`${tag} hero block (${heroFields.join(", ")}) is incomplete`);
  }
  const uiFields = [
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
  ];
  if (!content.ui || uiFields.some((field) => !content.ui[field])) {
    errors.push(`${tag} ui block (${uiFields.join(", ")}) is incomplete`);
  } else if (content.ui.moreComponents.indexOf("{n}") === -1) {
    errors.push(`${tag} ui.moreComponents must contain {n}`);
  }

  const tokenIds = ["pre-token", "total-supply", "main-token", "economic-engine", "utility", "staking"];
  const tokenGroups = ["identity", "economy"];
  const metricRowIds = ["pre", "main"];
  if (!content.tokenSummary || content.tokenSummary.cards.length !== tokenIds.length) {
    errors.push(`${tag} token summary must expose ${tokenIds.length} cards`);
  } else {
    const summary = content.tokenSummary;

    // Kicker and section title are brand elements: identical in every language.
    ["badge", "title"].forEach((key) => {
      if (summary[key] !== reference.tokenSummary[key]) {
        errors.push(
          `${tag} tokenSummary.${key} must stay language-independent ("${reference.tokenSummary[key]}")`
        );
      }
    });
    if (summary.groups.map((group) => group.id).join(",") !== tokenGroups.join(",")) {
      errors.push(`${tag} token groups must be ${tokenGroups.join(", ")}`);
    }

    summary.cards.forEach((card, index) => {
      const ref = reference.tokenSummary.cards[index];
      if (!ref || card.id !== ref.id) {
        errors.push(`${tag} token card ${index + 1} id differs from "${ref ? ref.id : "unknown"}"`);
        return;
      }
      if (card.group !== ref.group) errors.push(`${tag} token card "${card.id}" group differs from "${ref.group}"`);
      if (card.icon !== ref.icon) errors.push(`${tag} token card "${card.id}" icon differs from "${ref.icon}"`);
      if (card.fields.length !== ref.fields.length) {
        errors.push(`${tag} token card "${card.id}" spec-row count differs`);
        return;
      }
      card.fields.forEach((field, fieldIndex) => {
        const referenceField = ref.fields[fieldIndex];
        if (!referenceField) return;
        if (numericSignature(field.value) !== numericSignature(referenceField.value)) {
          errors.push(
            `${tag} token card "${card.id}" row ${fieldIndex + 1} must keep the same numbers across languages (expected ${numericSignature(referenceField.value)})`
          );
        }
      });
    });

    const metrics = summary.metrics;
    if (metrics.rows.map((row) => row.id).join(",") !== metricRowIds.join(",")) {
      errors.push(`${tag} metric rows must be ${metricRowIds.join(", ")}`);
    }
    metrics.rows.forEach((row, index) => {
      const ref = reference.tokenSummary.metrics.rows[index];
      if (!ref) return;
      ["total", "released", "percent", "multiplier"].forEach((key) => {
        if (row[key] !== ref[key]) {
          errors.push(`${tag} metric ${row.id}.${key} must stay language-independent ("${ref[key]}")`);
        }
      });
    });

    const referenceConversion = reference.tokenSummary.metrics.conversion;
    ["fromValue", "toValue"].forEach((key) => {
      if (metrics.conversion[key] !== referenceConversion[key]) {
        errors.push(`${tag} conversion.${key} must stay language-independent ("${referenceConversion[key]}")`);
      }
    });

    metrics.stage.items.forEach((item, index) => {
      const ref = reference.tokenSummary.metrics.stage.items[index];
      if (!ref) {
        errors.push(`${tag} stage item ${index + 1} is missing`);
        return;
      }
      // Values may carry a localized descriptor ("×10 versus the main token"),
      // so across languages only the numeric signature has to match.
      if (numericSignature(item.value) !== numericSignature(ref.value)) {
        errors.push(
          `${tag} stage item "${ref.label}" must keep the same numbers across languages (expected ${numericSignature(ref.value)})`
        );
      }
    });
  }
  if (Object.keys(content.labels).length !== Object.keys(reference.labels).length) errors.push(`${tag} labels count differs`);
  if (content.dependencies.length !== reference.dependencies.length) errors.push(`${tag} dependencies count differs`);
  // Brand identity is language-independent on purpose: the three headline lines
  // (brand, tagline, pageName) and the document title stay English everywhere.
  ["brand", "tagline", "pageName"].forEach((field) => {
    if (content.hero[field] !== reference.hero[field]) {
      errors.push(`${tag} hero.${field} must stay language-independent ("${reference.hero[field]}")`);
    }
  });
  if (content.meta.documentTitle !== reference.meta.documentTitle) {
    errors.push(`${tag} meta.documentTitle must stay language-independent ("${reference.meta.documentTitle}")`);
  }
  if (content.criticalPath.join(",") !== reference.criticalPath.join(",")) errors.push(`${tag} criticalPath differs`);
  if (content.pillars.length !== PILLARS.length) errors.push(`${tag} pillar count differs`);

  PILLARS.forEach((expected, index) => {
    const pillar = content.pillars[index];
    if (!pillar) { errors.push(`${tag} missing pillar ${expected.id}`); return; }
    if (pillar.id !== expected.id) errors.push(`${tag} pillar order mismatch at ${index}: ${pillar.id}`);
    const componentIds = pillar.components.map((c) => c.id).sort();
    if (componentIds.join(",") !== [...expected.components].sort().join(",")) errors.push(`${tag} ${expected.id}: components do not match the approved architecture`);
    pillar.phases.forEach((phase) => {
      const ref = reference.pillars[index].phases.find((p) => p.id === phase.id);
      if (!ref) { errors.push(`${tag} unknown phase ${phase.id}`); return; }
      if (phase.deliverables.length !== ref.deliverables.length) errors.push(`${tag} ${phase.id} deliverables count differs`);
      if (phase.milestones.length !== ref.milestones.length) errors.push(`${tag} ${phase.id} milestones count differs`);
      if (phase.timeline.start !== ref.timeline.start || phase.timeline.end !== ref.timeline.end) errors.push(`${tag} ${phase.id} timeline differs`);
      phase.components.forEach((id) => {
        if (!expected.components.includes(id)) errors.push(`${tag} ${phase.id} references unknown component ${id}`);
      });
    });
  });

  const phaseIds = content.pillars.flatMap((p) => p.phases.map((ph) => ph.id));
  if (new Set(phaseIds).size !== phaseIds.length) errors.push(`${tag} duplicate phase ids`);
  if (content.exitCriteria.length !== reference.exitCriteria.length) errors.push(`${tag} exitCriteria count differs`);
  return { errors, phaseIds };
}

function renderPhase(content, phase, componentNames) {
  const lines = [];
  lines.push(`#### ${phase.title}`);
  lines.push("");
  lines.push(`- **${content.labels.description}:** ${phase.description}`);
  lines.push(`- **${content.labels.components}:** ${phase.components.map((id) => componentNames.get(id) ?? id).join(" · ")}`);
  lines.push(`- **${content.labels.deliverables}:**`);
  phase.deliverables.forEach((item) => lines.push(`  - ${item}`));
  lines.push(`- **${content.labels.milestones}:**`);
  phase.milestones.forEach((item) => lines.push(`  - ${item}`));
  lines.push(`- **${content.labels.timeline}:** ${phase.timeline.label}`);
  lines.push("");
  return lines.join("\n");
}

function renderLocale(content) {
  const phaseOrder = new Map(content.pillars.flatMap((p) => p.phases.map((ph) => [ph.id, ph.order])));
  const phaseRef = (id) => content.labels.phase.replace("{n}", String(phaseOrder.get(id) ?? id));
  const componentNames = new Map(content.pillars.flatMap((p) => p.components.map((c) => [c.id, c.name])));
  const languageHeading =
    content.languageName === content.nativeName
      ? content.languageName
      : `${content.languageName} — ${content.nativeName}`;
  const out = [];

  out.push(`<a id="${content.locale}"></a>`);
  out.push("");
  out.push(`## ${languageHeading}`);
  out.push("");
  out.push(`**${content.labels.language}:** ${content.nativeName} (\`${content.locale}\`, ${content.dir})`);
  out.push("");
  out.push(`### ${content.meta.documentTitle}`);
  out.push("");
  out.push(`*${content.meta.tagline}*`);
  out.push("");
  out.push(content.meta.intro);
  out.push("");
  out.push(`**${content.labels.principles}**`);
  out.push("");
  content.meta.principles.forEach((item) => out.push(`- ${item}`));
  out.push("");

  // Pillar / phase overview table
  out.push(`### ${content.labels.timelineOverview}`);
  out.push("");
  out.push(`| ${content.labels.pillars} | ${content.labels.components} | ${content.labels.phases} | ${content.labels.timeline} |`);
  out.push("|---|---|---|---|");
  content.pillars.forEach((pillar) => {
    pillar.phases.forEach((phase) => {
      out.push(
        `| ${cell(pillar.title)} | ${cell(phase.components.map((id) => componentNames.get(id) ?? id).join(", "))} | ${cell(phase.title)} | ${cell(phase.timeline.label)} |`
      );
    });
  });
  out.push("");

  // Pillars and phases
  content.pillars.forEach((pillar) => {
    out.push(`### ${pillar.title}`);
    out.push("");
    out.push(pillar.summary);
    out.push("");
    out.push(`**${content.labels.components}:** ${pillar.components.map((c) => c.name).join(" · ")}`);
    out.push("");
    pillar.phases.forEach((phase) => out.push(renderPhase(content, phase, componentNames)));
  });

  // Token summary
  out.push(`### ${content.tokenSummary.badge} — ${content.tokenSummary.title}`);
  out.push("");
  out.push(content.tokenSummary.intro);
  out.push("");
  content.tokenSummary.groups.forEach((group) => {
    out.push(`#### ${group.label}`);
    out.push("");
    content.tokenSummary.cards
      .filter((card) => card.group === group.id)
      .forEach((card) => {
        out.push(`##### ${card.title} — ${card.subtitle.join(" · ")}`);
        out.push("");
        card.fields.forEach((field) => out.push(`- **${field.label}:** ${field.value}`));
        out.push("");
      });
  });

  const tokenMetrics = content.tokenSummary.metrics;
  out.push(`##### ${tokenMetrics.stage.title}: ${tokenMetrics.stage.value}`);
  out.push("");
  out.push(
    `| ${tokenMetrics.columnLabels.label} | ${tokenMetrics.columnLabels.total} | ${tokenMetrics.columnLabels.released} | ${tokenMetrics.columnLabels.percent} | ${tokenMetrics.columnLabels.multiplier} |`
  );
  out.push("|---|---|---|---|---|");
  tokenMetrics.rows.forEach((row) => {
    out.push(
      `| ${cell(row.label)} | ${cell(row.total)} | ${cell(row.released)} | ${cell(row.percent)} | ${cell(row.multiplier)} |`
    );
  });
  out.push("");
  out.push(`**${tokenMetrics.conversion.caption}**`);
  out.push("");
  tokenMetrics.stage.items.forEach((item) => out.push(`- ${item.label}: ${item.value}`));
  out.push("");
  out.push(`**${tokenMetrics.cta.label}** — ${tokenMetrics.cta.note}`);
  out.push("");

  // Dependencies
  out.push(`### ${content.labels.dependencies}`);
  out.push("");
  out.push(`| ${content.labels.phases} | ${content.labels.description} |`);
  out.push("|---|---|");
  content.dependencies.forEach((dep) => {
    out.push(`| ${cell(`${phaseRef(dep.from)} → ${phaseRef(dep.to)}`)} | ${cell(dep.note)} |`);
  });
  out.push("");
  out.push(`**${content.labels.criticalPath}:** ${content.criticalPath.map(phaseRef).join(" → ")}`);
  out.push("");

  // Exit criteria
  out.push(`### ${content.labels.exitCriteria}`);
  out.push("");
  content.exitCriteria.forEach((entry) => {
    const pillar = content.pillars.find((p) => p.id === entry.pillarId);
    out.push(`- **${pillar ? pillar.title : entry.pillarId}**`);
    entry.criteria.forEach((item) => out.push(`  - ${item}`));
  });
  out.push("");
  out.push(`### ${content.labels.programExit}`);
  out.push("");
  content.meta.programExitCriteria.forEach((item) => out.push(`- ${item}`));
  out.push("");
  out.push("---");
  out.push("");
  return out.join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const roadmaps = LOCALES.map(loadRoadmap);
  const reference = roadmaps[0];
  const errors = [];
  roadmaps.forEach((content) => errors.push(...validate(content, reference).errors));
  const totalPhases = reference.pillars.reduce((sum, pillar) => sum + pillar.phases.length, 0);

  if (errors.length > 0) {
    console.error(`Roadmap validation failed with ${errors.length} error(s):`);
    errors.forEach((error) => console.error(` - ${error}`));
    process.exit(1);
  }

  console.log(
    `Validated ${roadmaps.length} locales · ${reference.pillars.length} pillars · ${totalPhases} phases · ${reference.tokenSummary.cards.length} token cards · ${reference.dependencies.length} dependencies.`
  );
  if (checkOnly) return;

  const header = [
    `# ${reference.meta.documentTitle}`,
    "",
    `> ${reference.meta.tagline}`,
    ">",
    `> **Languages:** ${LOCALES.map((code) => `${code}`).join(" · ")} — identical structure in every language.`,
    ">",
    `> **Source of truth:** \`src/content/roadmap/*.json\` · regenerate with \`npm run roadmap:build\`.`,
    "",
    "## Table of contents",
    ""
  ];
  roadmaps.forEach((content) => {
    header.push(`- [${content.languageName} — ${content.nativeName}](#${content.locale})`);
  });
  header.push("", "---", "");

  const body = roadmaps.map(renderLocale).join("\n");
  writeFileSync(OUTPUT_FILE, `${header.join("\n")}${body}`, "utf8");
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main();
