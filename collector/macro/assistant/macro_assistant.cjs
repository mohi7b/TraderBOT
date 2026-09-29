"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/assistant/macro_assistant.cjs
 * Description:
 *   Macro Assistant — Phase 20 (Chalak / ultra-light build).
 *   Turns the full macro pipeline into a short, natural, slightly
 *   personalized Persian response. Text composition only — no
 *   heavy processing.
 *
 *   generateMacroResponse("USA: CPI YoY") -> {
 *     response, memory_used, full
 *   }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const MacroService = require("../query/integration/macro_service.cjs");
const Memory = require("../memory/user_memory.cjs");

// Light structured summary of the full pipeline output.
function buildSummary(full) {
  const profile = full && full.country_profile ? full.country_profile : {};
  const risk = full && full.risk ? full.risk : {};
  const policy = full && full.policy ? full.policy : {};
  const query = full && full.query ? full.query : {};

  const indicators = Array.isArray(query.series)
    ? query.series.map((s) => s.indicator).filter(Boolean)
    : [];
  const frequencies = [];
  if (full && full.chart && Array.isArray(full.chart.series)) {
    for (const s of full.chart.series) {
      if (s && typeof s.frequency === "string" && !frequencies.includes(s.frequency)) {
        frequencies.push(s.frequency);
      }
    }
  }

  return {
    country: profile.country || null,
    indicators,
    frequencies,
    inflation_trend: profile.inflation_trend,
    growth_trend: profile.growth_trend,
    policy_stance: profile.policy_stance,
    macro_score: profile.macro_score,
    next_move: policy.next_move,
    risk: risk.inflation ? risk.inflation.level : null,
    text: profile.summary || "",
  };
}

// Adds light memory-based personalization notes to a summary.
function applyPersonalization(summary, mem) {
  const m = mem || {};
  const countries = Array.isArray(m.countries) ? m.countries : [];
  const indicators = Array.isArray(m.indicators) ? m.indicators : [];
  const frequencies = Array.isArray(m.frequencies) ? m.frequencies : [];

  const personalized = { ...summary };
  const country = summary.country;
  personalized.favorite_country = country ? countries.includes(country) : false;

  const notes = [];
  if (country && personalized.favorite_country) {
    notes.push(`${country} یکی از کشورهای پرتکرار شماست.`);
  }
  if (Array.isArray(summary.indicators) && summary.indicators.length > 0) {
    const known = summary.indicators.filter((i) => indicators.includes(i));
    if (known.length > 0) notes.push(`شاخص ${known.join("، ")} را قبلاً بررسی کرده‌اید.`);
  }
  if (Array.isArray(summary.frequencies) && summary.frequencies.length > 0) {
    const known = summary.frequencies.filter((f) => frequencies.includes(f));
    if (known.length > 0) notes.push(`فرکانس ${known.join("، ")} برای شما آشناست.`);
  }
  personalized.note = notes.join(" ");
  return personalized;
}

// Short natural-language Persian response from the full result + memory.
function composeResponse(full, mem) {
  const summary = buildSummary(full);
  const personalized = applyPersonalization(summary, mem);

  const lines = [];
  if (personalized.text) {
    lines.push(
      personalized.country ? `کشور ${personalized.country}: ${personalized.text}` : personalized.text
    );
  }
  if (personalized.next_move && personalized.next_move !== "unknown") {
    lines.push(`اقدام محتمل بانک مرکزی: ${personalized.next_move}`);
  }
  if (personalized.macro_score && typeof personalized.macro_score.value === "number") {
    lines.push(
      `امتیاز کلان: ${personalized.macro_score.value}/۳ (${personalized.macro_score.label})`
    );
  }
  if (personalized.note) lines.push(personalized.note);

  return lines.join(" — ") || "داده‌ی کافی برای تحلیل در دسترس نیست.";
}

/**
 * Runs the full pipeline and returns a natural, personalized response.
 *
 * @param {string} queryText - DSL query, e.g. "USA: CPI YoY"
 * @returns {Promise<object>} - { response, memory_used, full }
 */
async function generateMacroResponse(queryText) {
  const full = await MacroService.runMacroPipeline(queryText);
  const mem = Memory.getMemory();

  const response = composeResponse(full, mem);

  return {
    response,
    memory_used: mem,
    full,
  };
}

module.exports = { generateMacroResponse };
